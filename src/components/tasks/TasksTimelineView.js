import React, { useState, useMemo } from 'react';
import { 
  ChevronLeftIcon, 
  ChevronRightIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';

export default function TasksTimelineView({ tasks, onTaskClick, dependencies = [] }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [zoomLevel, setZoomLevel] = useState('week'); // 'day', 'week', 'month'

  // Calculate timeline bounds
  const timelineBounds = useMemo(() => {
    if (tasks.length === 0) {
      const start = new Date(currentDate);
      start.setDate(start.getDate() - 7);
      const end = new Date(currentDate);
      end.setDate(end.getDate() + 7);
      return { start, end };
    }

    let minDate = null;
    let maxDate = null;

    tasks.forEach(task => {
      const startDate = task.start_date ? new Date(task.start_date) : (task.due_date ? new Date(task.due_date) : null);
      const dueDate = task.due_date ? new Date(task.due_date) : null;

      if (startDate) {
        if (!minDate || startDate < minDate) minDate = startDate;
        if (!maxDate || startDate > maxDate) maxDate = startDate;
      }
      if (dueDate) {
        if (!minDate || dueDate < minDate) minDate = dueDate;
        if (!maxDate || dueDate > maxDate) maxDate = dueDate;
      }
    });

    // Add padding
    if (minDate) {
      minDate.setDate(minDate.getDate() - 7);
    } else {
      minDate = new Date(currentDate);
      minDate.setDate(minDate.getDate() - 7);
    }

    if (maxDate) {
      maxDate.setDate(maxDate.getDate() + 7);
    } else {
      maxDate = new Date(currentDate);
      maxDate.setDate(maxDate.getDate() + 7);
    }

    return { start: minDate, end: maxDate };
  }, [tasks, currentDate]);

  const getDaysBetween = (start, end) => {
    const days = [];
    const current = new Date(start);
    while (current <= end) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return days;
  };

  const getWeeksBetween = (start, end) => {
    const weeks = [];
    const current = new Date(start);
    // Start from Monday
    const day = current.getDay();
    const diff = current.getDate() - day + (day === 0 ? -6 : 1);
    current.setDate(diff);

    while (current <= end) {
      weeks.push(new Date(current));
      current.setDate(current.getDate() + 7);
    }
    return weeks;
  };

  const getMonthsBetween = (start, end) => {
    const months = [];
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    while (current <= end) {
      months.push(new Date(current));
      current.setMonth(current.getMonth() + 1);
    }
    return months;
  };

  const getDatePosition = (date, timelineStart, timelineEnd, width) => {
    const totalDays = (timelineEnd - timelineStart) / (1000 * 60 * 60 * 24);
    const daysFromStart = (date - timelineStart) / (1000 * 60 * 60 * 24);
    return (daysFromStart / totalDays) * width;
  };

  const getTaskBar = (task) => {
    const startDate = task.start_date ? new Date(task.start_date) : (task.due_date ? new Date(task.due_date) : null);
    const dueDate = task.due_date ? new Date(task.due_date) : null;

    if (!startDate && !dueDate) return null;

    const actualStart = startDate || dueDate;
    const actualEnd = dueDate || (startDate ? new Date(startDate.getTime() + 24 * 60 * 60 * 1000) : null);

    if (!actualEnd) return null;

    const left = getDatePosition(actualStart, timelineBounds.start, timelineBounds.end, 100);
    const width = getDatePosition(actualEnd, timelineBounds.start, timelineBounds.end, 100) - left;

    return { left: Math.max(0, left), width: Math.max(2, width) };
  };

  const getTaskColor = (task) => {
    if (task.status === 'done') return 'bg-green-500';
    if (task.status === 'blocked') return 'bg-red-500';
    if (task.priority === 'urgent') return 'bg-red-600';
    if (task.priority === 'high') return 'bg-orange-500';
    if (task.status === 'in_progress') return 'bg-blue-500';
    return 'bg-neutral-400';
  };

  const renderTimelineHeader = () => {
    let timeUnits = [];
    let unitWidth = 0;

    if (zoomLevel === 'day') {
      timeUnits = getDaysBetween(timelineBounds.start, timelineBounds.end);
      unitWidth = 100 / timeUnits.length;
    } else if (zoomLevel === 'week') {
      timeUnits = getWeeksBetween(timelineBounds.start, timelineBounds.end);
      unitWidth = 100 / timeUnits.length;
    } else {
      timeUnits = getMonthsBetween(timelineBounds.start, timelineBounds.end);
      unitWidth = 100 / timeUnits.length;
    }

    return (
      <div className="border-b border-neutral-200 bg-neutral-50">
        <div className="relative" style={{ height: '60px' }}>
          {timeUnits.map((unit, index) => {
            const left = (index / timeUnits.length) * 100;
            return (
              <div
                key={index}
                className="absolute border-l border-neutral-300"
                style={{ left: `${left}%`, height: '100%' }}
              >
                <div className="px-2 py-1 text-xs font-medium text-neutral-700">
                  {zoomLevel === 'day' && unit.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {zoomLevel === 'week' && `Week ${Math.ceil((unit.getDate()) / 7)}`}
                  {zoomLevel === 'month' && unit.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderDependencyLine = (dependency) => {
    const sourceTask = tasks.find(t => t.id === dependency.depends_on_task_id || t.id === dependency.depends_on_item_id);
    const targetTask = tasks.find(t => t.id === dependency.task_id || t.id === dependency.item_id);

    if (!sourceTask || !targetTask) return null;

    const sourceBar = getTaskBar(sourceTask);
    const targetBar = getTaskBar(targetTask);

    if (!sourceBar || !targetBar) return null;

    const sourceX = sourceBar.left + sourceBar.width;
    const sourceY = tasks.indexOf(sourceTask) * 60 + 30;
    const targetX = targetBar.left;
    const targetY = tasks.indexOf(targetTask) * 60 + 30;

    const midX = (sourceX + targetX) / 2;

    return (
      <svg
        key={`${sourceTask.id}-${targetTask.id}`}
        className="absolute pointer-events-none"
        style={{ width: '100%', height: `${tasks.length * 60}px`, top: 0, left: 0, zIndex: 1 }}
      >
        <path
          d={`M ${sourceX}% ${sourceY} L ${midX}% ${sourceY} L ${midX}% ${targetY} L ${targetX}% ${targetY}`}
          stroke="#6b7280"
          strokeWidth="2"
          fill="none"
          strokeDasharray="5,5"
          markerEnd="url(#arrowhead)"
        />
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
            <polygon points="0 0, 10 3, 0 6" fill="#6b7280" />
          </marker>
        </defs>
      </svg>
    );
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const newDate = new Date(currentDate);
              if (zoomLevel === 'day') newDate.setDate(newDate.getDate() - 1);
              else if (zoomLevel === 'week') newDate.setDate(newDate.getDate() - 7);
              else newDate.setMonth(newDate.getMonth() - 1);
              setCurrentDate(newDate);
            }}
            className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => {
              const newDate = new Date(currentDate);
              if (zoomLevel === 'day') newDate.setDate(newDate.getDate() + 1);
              else if (zoomLevel === 'week') newDate.setDate(newDate.getDate() + 7);
              else newDate.setMonth(newDate.getMonth() + 1);
              setCurrentDate(newDate);
            }}
            className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
          >
            Today
          </button>
        </div>
        <div className="flex items-center gap-2 bg-neutral-100 rounded-lg p-1">
          <button
            onClick={() => setZoomLevel('day')}
            className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
              zoomLevel === 'day' ? 'bg-white text-brand-purple shadow-sm' : 'text-neutral-700'
            }`}
          >
            Day
          </button>
          <button
            onClick={() => setZoomLevel('week')}
            className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
              zoomLevel === 'week' ? 'bg-white text-brand-purple shadow-sm' : 'text-neutral-700'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setZoomLevel('month')}
            className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
              zoomLevel === 'month' ? 'bg-white text-brand-purple shadow-sm' : 'text-neutral-700'
            }`}
          >
            Month
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
        {renderTimelineHeader()}
        <div className="relative overflow-x-auto">
          <div className="min-w-full">
            {tasks.map((task, index) => {
              const bar = getTaskBar(task);
              if (!bar) return null;

              return (
                <div
                  key={task.id}
                  className="relative border-b border-neutral-200 hover:bg-neutral-50 transition-colors"
                  style={{ height: '60px' }}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-48 border-r border-neutral-200 bg-white px-4 flex items-center">
                    <div className="flex-1 min-w-0">
                      <div
                        className="font-medium text-sm text-neutral-900 truncate cursor-pointer hover:text-brand-purple"
                        onClick={() => onTaskClick(task)}
                        title={task.name}
                      >
                        {task.name}
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        {task.group_name} • {task.status}
                      </div>
                    </div>
                  </div>
                  <div className="ml-48 relative" style={{ height: '100%' }}>
                    <div
                      className={`absolute top-2 bottom-2 rounded ${getTaskColor(task)} cursor-pointer hover:opacity-80 transition-opacity flex items-center px-2 text-white text-xs font-medium`}
                      style={{ left: `${bar.left}%`, width: `${bar.width}%`, minWidth: '20px' }}
                      onClick={() => onTaskClick(task)}
                      title={`${task.name} (${task.start_date ? new Date(task.start_date).toLocaleDateString() : 'No start'} - ${task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No due date'})`}
                    >
                      <span className="truncate">{task.name}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {tasks.length === 0 && (
              <div className="text-center py-12 text-neutral-400">
                <p>No tasks with dates to display</p>
              </div>
            )}
          </div>
          {/* Dependency lines */}
          {dependencies.length > 0 && (
            <div className="absolute inset-0 pointer-events-none">
              {dependencies.map(dep => renderDependencyLine(dep))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
