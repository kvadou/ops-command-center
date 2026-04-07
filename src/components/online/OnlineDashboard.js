import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
} from '@heroicons/react/24/outline';

export default function OnlineDashboard() {
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    totalJobs: 0,
    totalLessons: 0,
    upcomingLessons: 0,
    completedLessons: 0,
    totalRevenue: 0,
    activeStudents: 0,
    totalHours: 0,
    thisMonth: {
      lessons: 0,
      revenue: 0,
      hours: 0,
    },
    lastMonth: {
      lessons: 0,
      revenue: 0,
      hours: 0,
    },
  });

  useEffect(() => {
    // Fetch dashboard data
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/online/dashboard', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setDashboardData(data);
      } else {
        console.error('Failed to fetch online dashboard data');
      }
    } catch (error) {
      console.error('Error fetching online dashboard data:', error);
    } finally {
      setLoading(false);
    }
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

  return (
    <RoleProvider>
      <BranchProvider>
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
              <div>
                <h1 className="text-2xl font-bold text-neutral-900">Online Dashboard</h1>
                <p className="text-sm text-neutral-600 mt-1">
                  Overview of online lesson operations and performance
                </p>
              </div>
              <Link
                to="/online/booking-forms"
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors duration-200 font-medium"
              >
                <CalendarIcon className="h-5 w-5" />
                View Booking Forms
              </Link>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-neutral-500">Loading dashboard data...</div>
              </div>
            ) : (
              <>
                {/* Overview Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <StatCard
                    title="Total Jobs"
                    value={dashboardData.totalJobs}
                    icon={BriefcaseIcon}
                  />
                  <StatCard
                    title="Total Lessons"
                    value={dashboardData.totalLessons}
                    icon={CalendarIcon}
                    subtitle={`${dashboardData.completedLessons} completed, ${dashboardData.upcomingLessons} upcoming`}
                  />
                  <StatCard
                    title="Total Revenue"
                    value={formatCurrency(dashboardData.totalRevenue)}
                    icon={CurrencyDollarIcon}
                  />
                  <StatCard
                    title="Active Students"
                    value={dashboardData.activeStudents}
                    icon={UserGroupIcon}
                  />
                </div>

                {/* Additional Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <StatCard
                    title="Total Hours"
                    value={dashboardData.totalHours.toFixed(1)}
                    icon={ClockIcon}
                    subtitle="Hours delivered"
                  />
                  <StatCard
                    title="This Month Lessons"
                    value={dashboardData.thisMonth.lessons}
                    icon={ChartBarIcon}
                    subtitle={formatCurrency(dashboardData.thisMonth.revenue)}
                    trend={dashboardData.thisMonth.lessons > dashboardData.lastMonth.lessons ? 'up' : 'down'}
                    trendValue={`vs ${dashboardData.lastMonth.lessons} last month`}
                  />
                  <StatCard
                    title="This Month Hours"
                    value={dashboardData.thisMonth.hours.toFixed(1)}
                    icon={ClockIcon}
                    subtitle={`${dashboardData.thisMonth.revenue > 0 ? formatCurrency(dashboardData.thisMonth.revenue) : 'No revenue'}`}
                  />
                </div>

                {/* Quick Actions */}
                <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
                  <h2 className="text-lg font-semibold text-neutral-900 mb-4">Quick Actions</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Link
                      to="/online/booking-forms"
                      className="flex items-center gap-3 p-4 border border-neutral-200 rounded-lg hover:border-brand-purple hover:bg-brand-purple/5 transition-all duration-200"
                    >
                      <CalendarIcon className="h-6 w-6 text-brand-purple" />
                      <div>
                        <h3 className="font-medium text-neutral-900">Manage Booking Forms</h3>
                        <p className="text-sm text-neutral-600">Configure online lesson booking forms</p>
                      </div>
                    </Link>
                    <Link
                      to="/online/tournament"
                      className="flex items-center gap-3 p-4 border border-neutral-200 rounded-lg hover:border-brand-purple hover:bg-brand-purple/5 transition-all duration-200"
                    >
                      <ChartBarIcon className="h-6 w-6 text-brand-purple" />
                      <div>
                        <h3 className="font-medium text-neutral-900">Tournaments</h3>
                        <p className="text-sm text-neutral-600">View and manage online tournaments</p>
                      </div>
                    </Link>
                    <Link
                      to="/calendar"
                      className="flex items-center gap-3 p-4 border border-neutral-200 rounded-lg hover:border-brand-purple hover:bg-brand-purple/5 transition-all duration-200"
                    >
                      <CalendarIcon className="h-6 w-6 text-brand-purple" />
                      <div>
                        <h3 className="font-medium text-neutral-900">View Calendar</h3>
                        <p className="text-sm text-neutral-600">See all online lessons on calendar</p>
                      </div>
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>
      </BranchProvider>
    </RoleProvider>
  );
}









