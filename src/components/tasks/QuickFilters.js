import React from 'react';
import { 
  UserIcon, 
  ClockIcon, 
  ExclamationTriangleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

const QUICK_FILTERS = [
  {
    id: 'my_tasks',
    label: 'My Tasks',
    icon: UserIcon,
    filter: (task, userId) => task.assignee_id === userId || task.creator_id === userId
  },
  {
    id: 'overdue',
    label: 'Overdue',
    icon: ExclamationTriangleIcon,
    filter: (task) => {
      if (!task.due_date || task.status === 'done') return false;
      return new Date(task.due_date) < new Date();
    }
  },
  {
    id: 'due_this_week',
    label: 'Due This Week',
    icon: ClockIcon,
    filter: (task) => {
      if (!task.due_date || task.status === 'done') return false;
      const dueDate = new Date(task.due_date);
      const today = new Date();
      const weekFromNow = new Date();
      weekFromNow.setDate(today.getDate() + 7);
      return dueDate >= today && dueDate <= weekFromNow;
    }
  },
  {
    id: 'due_today',
    label: 'Due Today',
    icon: ClockIcon,
    filter: (task) => {
      if (!task.due_date || task.status === 'done') return false;
      const dueDate = new Date(task.due_date);
      const today = new Date();
      return dueDate.toDateString() === today.toDateString();
    }
  },
  {
    id: 'completed',
    label: 'Completed',
    icon: CheckCircleIcon,
    filter: (task) => task.status === 'done'
  },
  {
    id: 'in_progress',
    label: 'In Progress',
    icon: ClockIcon,
    filter: (task) => task.status === 'in_progress'
  },
  {
    id: 'blocked',
    label: 'Blocked',
    icon: ExclamationTriangleIcon,
    filter: (task) => task.status === 'blocked'
  },
  {
    id: 'high_priority',
    label: 'High Priority',
    icon: ExclamationTriangleIcon,
    filter: (task) => ['high', 'urgent'].includes(task.priority)
  }
];

export default function QuickFilters({ activeFilter, onFilterChange, tasks, userId }) {
  const getFilterCount = (filter) => {
    return tasks.filter(task => filter.filter(task, userId)).length;
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {QUICK_FILTERS.map(filter => {
        const Icon = filter.icon;
        const isActive = activeFilter === filter.id;
        const count = getFilterCount(filter);

        return (
          <button
            key={filter.id}
            onClick={() => onFilterChange(isActive ? null : filter.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-brand-purple text-white'
                : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{filter.label}</span>
            {count > 0 && (
              <span className={`px-1.5 py-0.5 rounded text-xs ${
                isActive ? 'bg-white/20' : 'bg-neutral-100'
              }`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export { QUICK_FILTERS };
