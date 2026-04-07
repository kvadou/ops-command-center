import React, { useState, useEffect, useMemo } from 'react';
import { 
  ChartBarIcon,
  UserGroupIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowTrendingUpIcon
} from '@heroicons/react/24/outline';

export default function TasksDashboard({ tasks, board, customFields = [] }) {
  const [selectedPeriod, setSelectedPeriod] = useState('week'); // 'day', 'week', 'month', 'all'

  // Calculate statistics
  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'done').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const blocked = tasks.filter(t => t.status === 'blocked').length;
    const overdue = tasks.filter(t => {
      if (!t.due_date || t.status === 'done') return false;
      return new Date(t.due_date) < new Date();
    }).length;
    
    const completionRate = total > 0 ? (done / total) * 100 : 0;
    
    // Group by status
    const byStatus = tasks.reduce((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    }, {});
    
    // Group by priority
    const byPriority = tasks.reduce((acc, task) => {
      acc[task.priority] = (acc[task.priority] || 0) + 1;
      return acc;
    }, {});
    
    // Group by assignee
    const byAssignee = tasks.reduce((acc, task) => {
      const assignee = task.assignee_email || task.assignee_first_name || 'Unassigned';
      acc[assignee] = (acc[assignee] || 0) + 1;
      return acc;
    }, {});
    
    // Completion over time (last 7 days)
    const completionOverTime = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const completedOnDate = tasks.filter(t => {
        if (t.completed_at) {
          return t.completed_at.split('T')[0] === dateStr;
        }
        return false;
      }).length;
      completionOverTime.push({
        date: dateStr,
        count: completedOnDate
      });
    }
    
    return {
      total,
      done,
      inProgress,
      blocked,
      overdue,
      completionRate,
      byStatus,
      byPriority,
      byAssignee,
      completionOverTime
    };
  }, [tasks]);

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center justify-end">
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
        >
          <option value="day">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="all">All Time</option>
        </select>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-neutral-600">Total Tasks</span>
            <ChartBarIcon className="h-5 w-5 text-neutral-400" />
          </div>
          <div className="text-2xl font-bold text-neutral-900">{stats.total}</div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-neutral-600">Completed</span>
            <CheckCircleIcon className="h-5 w-5 text-green-600" />
          </div>
          <div className="text-2xl font-bold text-green-600">{stats.done}</div>
          <div className="text-xs text-neutral-500 mt-1">{stats.completionRate.toFixed(1)}% completion rate</div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-neutral-600">In Progress</span>
            <ClockIcon className="h-5 w-5 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-blue-600">{stats.inProgress}</div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-neutral-600">Overdue</span>
            <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
          </div>
          <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Status Distribution</h3>
          <div className="space-y-3">
            {Object.entries(stats.byStatus).map(([status, count]) => {
              const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
              return (
                <div key={status}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-neutral-700 capitalize">{status.replace('_', ' ')}</span>
                    <span className="text-sm font-medium text-neutral-900">{count}</span>
                  </div>
                  <div className="w-full bg-neutral-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        status === 'done' ? 'bg-green-500' :
                        status === 'in_progress' ? 'bg-blue-500' :
                        status === 'blocked' ? 'bg-red-500' :
                        'bg-neutral-400'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Priority Distribution */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Priority Distribution</h3>
          <div className="space-y-3">
            {Object.entries(stats.byPriority).map(([priority, count]) => {
              const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
              return (
                <div key={priority}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-neutral-700 capitalize">{priority}</span>
                    <span className="text-sm font-medium text-neutral-900">{count}</span>
                  </div>
                  <div className="w-full bg-neutral-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        priority === 'urgent' ? 'bg-red-600' :
                        priority === 'high' ? 'bg-orange-500' :
                        priority === 'medium' ? 'bg-yellow-500' :
                        'bg-neutral-400'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Completion Over Time & Team Workload */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Completion Over Time */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Completion Over Time</h3>
          <div className="h-48 flex items-end justify-between gap-2">
            {stats.completionOverTime.map((day, index) => {
              const maxCount = Math.max(...stats.completionOverTime.map(d => d.count), 1);
              const height = (day.count / maxCount) * 100;
              return (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-brand-purple rounded-t transition-all hover:bg-brand-navy"
                    style={{ height: `${Math.max(height, 5)}%` }}
                    title={`${day.count} tasks completed on ${new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                  />
                  <div className="text-xs text-neutral-500 mt-2 transform -rotate-45 origin-top-left whitespace-nowrap">
                    {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Team Workload */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Team Workload</h3>
          <div className="space-y-3">
            {Object.entries(stats.byAssignee)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([assignee, count]) => {
                const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
                return (
                  <div key={assignee}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <UserGroupIcon className="h-4 w-4 text-neutral-400" />
                        <span className="text-sm text-neutral-700 truncate max-w-[150px]">{assignee}</span>
                      </div>
                      <span className="text-sm font-medium text-neutral-900">{count}</span>
                    </div>
                    <div className="w-full bg-neutral-200 rounded-full h-2">
                      <div
                        className="bg-brand-purple h-2 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            {Object.keys(stats.byAssignee).length === 0 && (
              <p className="text-sm text-neutral-500 text-center py-4">No assigned tasks</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
