import React, { useState, useEffect } from 'react';
import { 
  ClockIcon,
  UserIcon,
  TagIcon,
  CalendarIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChatBubbleLeftRightIcon,
  PaperClipIcon,
  PlusIcon
} from '@heroicons/react/24/outline';

const UPDATE_TYPE_ICONS = {
  status_change: CheckCircleIcon,
  assignee_change: UserIcon,
  comment: ChatBubbleLeftRightIcon,
  field_update: TagIcon,
  attachment: PaperClipIcon,
  created: PlusIcon,
  due_date_change: CalendarIcon
};

const UPDATE_TYPE_LABELS = {
  status_change: 'changed status',
  assignee_change: 'assigned',
  comment: 'commented',
  field_update: 'updated',
  attachment: 'attached file',
  created: 'created',
  due_date_change: 'changed due date'
};

export default function ActivityFeed({ taskId, filters = {} }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');

  useEffect(() => {
    fetchActivities();
  }, [taskId, filterType]);

  const fetchActivities = async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const url = `/api/tasks/items/${taskId}/updates${filterType !== 'all' ? `?type=${filterType}` : ''}`;
      const response = await fetch(url, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setActivities(data.updates || []);
      }
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatActivityMessage = (activity) => {
    const author = activity.author_first_name || activity.author_email || 'Someone';
    const typeLabel = UPDATE_TYPE_LABELS[activity.update_type] || 'updated';
    
    switch (activity.update_type) {
      case 'status_change':
        return `${author} ${typeLabel} from "${activity.old_value}" to "${activity.new_value}"`;
      case 'assignee_change':
        const oldAssignee = activity.old_value || 'Unassigned';
        const newAssignee = activity.new_value || 'Unassigned';
        return `${author} ${typeLabel} from ${oldAssignee} to ${newAssignee}`;
      case 'comment':
        return `${author} ${typeLabel}: "${activity.new_value?.substring(0, 100)}${activity.new_value?.length > 100 ? '...' : ''}"`;
      case 'field_update':
        return `${author} ${typeLabel} ${activity.field_name} from "${activity.old_value || 'empty'}" to "${activity.new_value || 'empty'}"`;
      case 'due_date_change':
        const oldDate = activity.old_value ? new Date(activity.old_value).toLocaleDateString() : 'No date';
        const newDate = activity.new_value ? new Date(activity.new_value).toLocaleDateString() : 'No date';
        return `${author} ${typeLabel} from ${oldDate} to ${newDate}`;
      default:
        return `${author} ${typeLabel} ${activity.field_name || ''}`;
    }
  };

  const getActivityIcon = (updateType) => {
    const Icon = UPDATE_TYPE_ICONS[updateType] || ClockIcon;
    return Icon;
  };

  const getActivityColor = (updateType) => {
    switch (updateType) {
      case 'status_change':
        return 'text-blue-600 bg-blue-100';
      case 'assignee_change':
        return 'text-purple-600 bg-purple-100';
      case 'comment':
        return 'text-green-600 bg-green-100';
      case 'created':
        return 'text-brand-purple bg-brand-purple/20';
      default:
        return 'text-neutral-600 bg-neutral-100';
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple mx-auto"></div>
        <p className="mt-2 text-sm text-neutral-500">Loading activity...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-neutral-700">Filter:</label>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
        >
          <option value="all">All Activity</option>
          <option value="status_change">Status Changes</option>
          <option value="assignee_change">Assignments</option>
          <option value="comment">Comments</option>
          <option value="field_update">Field Updates</option>
          <option value="attachment">Attachments</option>
        </select>
      </div>

      {/* Activity Timeline */}
      <div className="space-y-3">
        {activities.length === 0 ? (
          <div className="text-center py-8 text-neutral-400">
            <ClockIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No activity yet</p>
          </div>
        ) : (
          activities.map((activity, index) => {
            const Icon = getActivityIcon(activity.update_type);
            const isLast = index === activities.length - 1;
            
            return (
              <div key={activity.id} className="relative flex gap-3">
                {/* Timeline line */}
                {!isLast && (
                  <div className="absolute left-5 top-10 bottom-0 w-0.5 bg-neutral-200" />
                )}
                
                {/* Icon */}
                <div className={`relative z-10 flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${getActivityColor(activity.update_type)}`}>
                  <Icon className="h-5 w-5" />
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-neutral-900">
                      {activity.author_first_name || activity.author_email || 'Unknown'}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {new Date(activity.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-700 leading-relaxed">
                    {formatActivityMessage(activity)}
                  </p>
                  {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                    <div className="mt-2 text-xs text-neutral-500">
                      {JSON.stringify(activity.metadata)}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
