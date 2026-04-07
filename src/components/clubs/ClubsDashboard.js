import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { DateTime } from 'luxon';
import DateRangePicker from '../DateRangePicker';
import { RoleProvider } from '../../contexts/RoleContext';
import { BranchProvider } from '../../contexts/BranchContext';
import { formatCurrency } from '../../utils/formatters';
import {
  CalendarIcon,
  UserGroupIcon,
  BriefcaseIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  BanknotesIcon,
  ReceiptPercentIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';

export default function ClubsDashboard() {
  const [loading, setLoading] = useState(true);

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

  const [dashboardData, setDashboardData] = useState({
    parkSlope: {
      totalJobs: 0,
      totalLessons: 0,
      upcomingLessons: 0,
      completedLessons: 0,
      totalRevenue: 0,
      activeStudents: 0,
      totalHours: 0,
    },
    ues: {
      totalJobs: 0,
      totalLessons: 0,
      upcomingLessons: 0,
      completedLessons: 0,
      totalRevenue: 0,
      activeStudents: 0,
      totalHours: 0,
    },
    combined: {
      totalJobs: 0,
      totalLessons: 0,
      upcomingLessons: 0,
      completedLessons: 0,
      totalRevenue: 0,
      activeStudents: 0,
      totalHours: 0,
    },
  });

  useEffect(() => {
    // Fetch dashboard data
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/clubs/dashboard', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setDashboardData(data);
      } else {
        console.error('Failed to fetch clubs dashboard data');
      }
    } catch (error) {
      console.error('Error fetching clubs dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

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

  const StatCard = ({ title, value, icon: Icon, subtitle, trend, trendValue }) => (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {Icon && <Icon className="h-5 w-5 text-brand-purple" />}
            <h3 className="text-sm font-medium text-neutral-600">{title}</h3>
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
    </div>
  );

  const ClubSection = ({ title, data, clubColor }) => (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-neutral-900">{title}</h2>
        <div className={`h-2 w-2 rounded-full ${clubColor}`} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Jobs"
          value={data.totalJobs}
          icon={BriefcaseIcon}
        />
        <StatCard
          title="Total Lessons"
          value={data.totalLessons}
          icon={CalendarIcon}
          subtitle={`${data.completedLessons} completed, ${data.upcomingLessons} upcoming`}
        />
        <StatCard
          title="Total Revenue"
          value={formatCurrency(data.totalRevenue)}
          icon={CurrencyDollarIcon}
        />
        <StatCard
          title="Active Students"
          value={data.activeStudents}
          icon={UserGroupIcon}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <StatCard
          title="Total Hours"
          value={data.totalHours.toFixed(1)}
          icon={ClockIcon}
          subtitle="Teaching hours"
        />
        <StatCard
          title="Avg Revenue per Lesson"
          value={formatCurrency(data.totalLessons > 0 ? data.totalRevenue / data.totalLessons : 0)}
          icon={ChartBarIcon}
        />
      </div>
    </div>
  );

  return (
    <RoleProvider>
      <BranchProvider>
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
              <div>
                <h1 className="text-2xl font-bold text-neutral-900">Clubs Dashboard</h1>
                <p className="text-sm text-neutral-600 mt-1">
                  Overview of Park Slope and UES Club operations
                </p>
              </div>
              <Link
                to="/clubs/calendar"
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors duration-200 font-medium"
              >
                <CalendarIcon className="h-5 w-5" />
                View Calendar
              </Link>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-neutral-500">Loading dashboard data...</div>
              </div>
            ) : (
              <>
                {/* Combined Overview */}
                <div className="bg-gradient-to-br from-brand-purple/10 via-white to-brand-light/20 rounded-xl shadow-sm border border-neutral-200 p-6">
                  <h2 className="text-xl font-semibold text-neutral-900 mb-6">Combined Overview</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard
                      title="Total Jobs"
                      value={dashboardData.combined.totalJobs}
                      icon={BriefcaseIcon}
                    />
                    <StatCard
                      title="Total Lessons"
                      value={dashboardData.combined.totalLessons}
                      icon={CalendarIcon}
                      subtitle={`${dashboardData.combined.completedLessons} completed, ${dashboardData.combined.upcomingLessons} upcoming`}
                    />
                    <StatCard
                      title="Total Revenue"
                      value={formatCurrency(dashboardData.combined.totalRevenue)}
                      icon={CurrencyDollarIcon}
                    />
                    <StatCard
                      title="Active Students"
                      value={dashboardData.combined.activeStudents}
                      icon={UserGroupIcon}
                    />
                  </div>
                </div>

                {/* Park Slope Club */}
                <ClubSection
                  title="Park Slope Club"
                  data={dashboardData.parkSlope}
                  clubColor="bg-blue-500"
                />

                {/* UES Club */}
                <ClubSection
                  title="Upper East Side (UES) Club"
                  data={dashboardData.ues}
                  clubColor="bg-green-500"
                />

                {/* Park Slope Operations Section */}
                <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                      <h2 className="text-xl font-semibold text-neutral-900">Park Slope Operations</h2>
                      <p className="text-sm text-neutral-500 mt-1">Daily performance and lesson details</p>
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
                      {/* Summary Cards */}
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                        <div className="bg-neutral-50 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-1">
                            <CalendarIcon className="h-4 w-4 text-brand-purple" />
                            <span className="text-xs font-medium text-neutral-600">Lessons</span>
                          </div>
                          <p className="text-xl font-bold text-neutral-900">{operationsData.summary.lessonCount}</p>
                        </div>
                        <div className="bg-neutral-50 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-1">
                            <UserGroupIcon className="h-4 w-4 text-brand-purple" />
                            <span className="text-xs font-medium text-neutral-600">Students</span>
                          </div>
                          <p className="text-xl font-bold text-neutral-900">{operationsData.summary.studentCount}</p>
                          <p className="text-xs text-neutral-500">{operationsData.summary.totalAttendance} attendance</p>
                        </div>
                        <div className="bg-green-50 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-1">
                            <CurrencyDollarIcon className="h-4 w-4 text-green-600" />
                            <span className="text-xs font-medium text-neutral-600">Revenue</span>
                          </div>
                          <p className="text-xl font-bold text-green-700">{formatCurrency(operationsData.summary.grossRevenue)}</p>
                        </div>
                        <div className="bg-amber-50 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-1">
                            <BanknotesIcon className="h-4 w-4 text-amber-600" />
                            <span className="text-xs font-medium text-neutral-600">Tutor Pay</span>
                          </div>
                          <p className="text-xl font-bold text-amber-700">{formatCurrency(operationsData.summary.tutorPay)}</p>
                        </div>
                        <div className={`${operationsData.summary.profit >= 0 ? 'bg-green-50' : 'bg-red-50'} rounded-lg p-4`}>
                          <div className="flex items-center gap-2 mb-1">
                            <ArrowTrendingUpIcon className={`h-4 w-4 ${operationsData.summary.profit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                            <span className="text-xs font-medium text-neutral-600">Profit</span>
                          </div>
                          <p className={`text-xl font-bold ${operationsData.summary.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {formatCurrency(operationsData.summary.profit)}
                          </p>
                        </div>
                        <div className="bg-neutral-50 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-1">
                            <ReceiptPercentIcon className="h-4 w-4 text-brand-purple" />
                            <span className="text-xs font-medium text-neutral-600">Margin</span>
                          </div>
                          <p className="text-xl font-bold text-neutral-900">{operationsData.summary.profitMargin}%</p>
                        </div>
                      </div>

                      {/* Lessons Table */}
                      {operationsData.lessons.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-neutral-200">
                            <thead className="bg-neutral-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Date/Time</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Job</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Tutor</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider">Students</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">Revenue</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">Pay</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">Profit</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider">Status</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-neutral-200">
                              {operationsData.lessons.map((lesson) => (
                                <tr
                                  key={lesson.appointmentId}
                                  onClick={() => setSelectedLesson(lesson)}
                                  className="hover:bg-brand-purple/5 cursor-pointer transition-colors"
                                >
                                  <td className="px-4 py-3 whitespace-nowrap">
                                    <div className="text-sm font-medium text-neutral-900">
                                      {DateTime.fromISO(lesson.date).toFormat('MMM d')}
                                    </div>
                                    <div className="text-xs text-neutral-500">{lesson.time}</div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="text-sm text-neutral-900 max-w-[200px] truncate" title={lesson.jobName}>
                                      {lesson.jobName}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-600">
                                    {lesson.tutorName}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-center text-sm text-neutral-900">
                                    {lesson.studentCount}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-green-600">
                                    {formatCurrency(lesson.revenue)}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-amber-600">
                                    {formatCurrency(lesson.tutorPay)}
                                  </td>
                                  <td className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${lesson.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {formatCurrency(lesson.profit)}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-center">
                                    {lesson.isCheckedOut ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                        <CheckCircleIcon className="h-3 w-3" />
                                        Complete
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                        <ExclamationCircleIcon className="h-3 w-3" />
                                        {lesson.status}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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
              </>
            )}
          </div>

          {/* Lesson Detail Modal */}
          {selectedLesson && (
            <div className="fixed inset-0 z-50 overflow-y-auto">
              <div className="flex items-center justify-center min-h-screen p-4">
                <div className="fixed inset-0 bg-black/50" onClick={() => setSelectedLesson(null)} />
                <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                  {/* Modal Header */}
                  <div className="flex items-center justify-between p-6 border-b border-neutral-200">
                    <div>
                      <h3 className="text-lg font-semibold text-neutral-900">Lesson Details</h3>
                      <p className="text-sm text-neutral-500">
                        {DateTime.fromISO(selectedLesson.date).toFormat('EEEE, MMM d, yyyy')} at {selectedLesson.time}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedLesson(null)}
                      className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
                    >
                      <XMarkIcon className="h-5 w-5 text-neutral-500" />
                    </button>
                  </div>

                  {/* Modal Content */}
                  <div className="p-6 space-y-6">
                    {/* Job & Tutor */}
                    <div>
                      <h4 className="text-sm font-medium text-neutral-500 mb-2">Job</h4>
                      <p className="text-neutral-900">{selectedLesson.jobName}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-neutral-500 mb-2">Tutor</h4>
                      <p className="text-neutral-900">{selectedLesson.tutorName}</p>
                    </div>

                    {/* Students */}
                    <div>
                      <h4 className="text-sm font-medium text-neutral-500 mb-2">
                        Students ({selectedLesson.studentCount})
                      </h4>
                      <div className="space-y-2">
                        {selectedLesson.students && selectedLesson.students.length > 0 ? (
                          selectedLesson.students.map((student, idx) => (
                            <div
                              key={idx}
                              className={`flex items-center justify-between p-2 rounded-lg ${
                                student.status === 'missed' ? 'bg-red-50' : 'bg-neutral-50'
                              }`}
                            >
                              <span className={student.status === 'missed' ? 'text-red-600' : 'text-neutral-900'}>
                                {student.name}
                              </span>
                              <div className="flex items-center gap-2">
                                {student.status === 'missed' && (
                                  <span className="text-xs text-red-600 font-medium">Missed</span>
                                )}
                                <span className="text-sm text-neutral-600">
                                  {formatCurrency(student.chargeRate || 0)}
                                </span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-neutral-500 text-sm">No student data available</p>
                        )}
                      </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="border-t border-neutral-200 pt-4">
                      <h4 className="text-sm font-medium text-neutral-500 mb-3">Financial Summary</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-green-50 rounded-lg p-3 text-center">
                          <p className="text-xs text-neutral-500 mb-1">Revenue</p>
                          <p className="text-lg font-bold text-green-700">{formatCurrency(selectedLesson.revenue)}</p>
                        </div>
                        <div className="bg-amber-50 rounded-lg p-3 text-center">
                          <p className="text-xs text-neutral-500 mb-1">Tutor Pay</p>
                          <p className="text-lg font-bold text-amber-700">{formatCurrency(selectedLesson.tutorPay)}</p>
                        </div>
                        <div className={`${selectedLesson.profit >= 0 ? 'bg-green-50' : 'bg-red-50'} rounded-lg p-3 text-center`}>
                          <p className="text-xs text-neutral-500 mb-1">Profit</p>
                          <p className={`text-lg font-bold ${selectedLesson.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {formatCurrency(selectedLesson.profit)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-neutral-500">Status</span>
                      {selectedLesson.isCheckedOut ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-green-100 text-green-700">
                          <CheckCircleIcon className="h-4 w-4" />
                          Checked Out
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-blue-100 text-blue-700">
                          <ExclamationCircleIcon className="h-4 w-4" />
                          {selectedLesson.status}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="flex justify-end p-6 border-t border-neutral-200">
                    <button
                      onClick={() => setSelectedLesson(null)}
                      className="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors font-medium"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
      </BranchProvider>
    </RoleProvider>
  );
}









