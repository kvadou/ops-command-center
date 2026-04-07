import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  AcademicCapIcon,
  UsersIcon,
  BriefcaseIcon,
  CalendarIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
  BoltIcon,
  NewspaperIcon,
  ClockIcon,
  UserGroupIcon,
  ChatBubbleLeftIcon,
} from "@heroicons/react/24/outline";
import { useRole } from "../contexts/RoleContext";
import { useBranch } from "../contexts/BranchContext";

import { formatDate } from '../utils/formatters';
// Preview version of TaskWidget - Full size to match actual widget
export function TaskWidgetPreview() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const params = new URLSearchParams({ due_soon: 'true' });
        const response = await fetch(`/api/tasks/my-tasks?${params}`, { credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          setTasks(data.tasks || []);
        }
      } catch (error) {
        console.error('Error fetching tasks:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
  }, []);

  const overdueTasks = tasks.filter(task => {
    if (!task.due_date || task.status === 'done') return false;
    return new Date(task.due_date) < new Date();
  });

  const dueTodayTasks = tasks.filter(task => {
    if (!task.due_date || task.status === 'done') return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(task.due_date);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate.getTime() === today.getTime();
  });

  const displayTasks = [...overdueTasks, ...dueTodayTasks].slice(0, 5);


  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return 'text-red-600 bg-red-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-neutral-600 bg-neutral-50';
      default: return 'text-neutral-600 bg-neutral-50';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'done': return 'text-green-600 bg-green-50';
      case 'in_progress': return 'text-blue-600 bg-blue-50';
      case 'blocked': return 'text-red-600 bg-red-50';
      case 'todo': return 'text-neutral-600 bg-neutral-50';
      default: return 'text-neutral-600 bg-neutral-50';
    }
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ClipboardDocumentListIcon className="h-5 w-5 text-brand-purple" />
          <h3 className="text-lg font-bold text-neutral-900 leading-tight">My Tasks</h3>
        </div>
      </div>
      <div className="space-y-3 flex-1">
        {loading ? (
          <div className="text-center py-8 text-neutral-500">
            <p className="text-sm">Loading tasks...</p>
          </div>
        ) : displayTasks.length === 0 ? (
          <div className="text-center py-8 px-4 bg-gradient-to-br from-brand-light/30 to-white rounded-lg border border-neutral-100">
            <p className="text-sm font-medium text-neutral-700 leading-relaxed">
              You have no overdue tasks or tasks due today.
            </p>
            <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
              Good job! 🎉
            </p>
          </div>
        ) : (
          displayTasks.map((task) => (
            <div key={task.id} className="flex items-start gap-3 p-3 bg-neutral-50 rounded-lg">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-bold text-neutral-900 truncate">{task.name}</h4>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(task.priority)}`}>
                    {task.priority}
                  </span>
                </div>
                {task.board_name && (
                  <p className="text-xs text-neutral-600 mb-1">{task.board_name} • {task.group_name}</p>
                )}
                {task.due_date && (
                  <p className={`text-xs ${new Date(task.due_date) < new Date() && task.status !== 'done' ? 'text-red-600 font-medium' : 'text-neutral-500'}`}>
                    Due: {formatDate(task.due_date)} {formatTime(task.due_date)}
                  </p>
                )}
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(task.status)}`}>
                {task.status.replace('_', ' ')}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Preview version of NewsFeedWidget
export function NewsFeedWidgetPreview() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { currentRole } = useRole();
  const { currentBranch } = useBranch();

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const params = new URLSearchParams({
          page: '1',
          limit: '1',
          role: currentRole || 'admin',
          branch_id: currentBranch || 'main'
        });
        const response = await fetch(`/api/news-feed/posts?${params}`, { credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          setPosts(data.posts || []);
        }
      } catch (error) {
        console.error('Error fetching news feed:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchPosts();
  }, [currentRole, currentBranch]);

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getAuthorName = (post) => {
    if (post.author_first_name && post.author_last_name) {
      return `${post.author_first_name} ${post.author_last_name}`;
    }
    if (post.author_email) {
      return post.author_email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    return 'Unknown';
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <NewspaperIcon className="h-4 w-4 text-brand-green" />
          <h3 className="text-sm font-bold text-neutral-900">Company News Feed</h3>
        </div>
      </div>
      {loading ? (
        <div className="text-center py-4 text-neutral-400 text-xs">Loading...</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-4 text-neutral-400 text-xs">No posts</div>
      ) : (
        <div className="space-y-2">
          {posts.slice(0, 1).map((post) => (
            <div key={post.id} className="pb-2 border-b border-neutral-100">
              <div className="flex items-start gap-2">
                <img
                  src={post.author_image_url || "/logo512.png"}
                  alt={getAuthorName(post)}
                  className="w-6 h-6 rounded-full object-contain bg-brand-light flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-xs font-bold text-neutral-900">{getAuthorName(post)}</span>
                    <span className="text-xs text-neutral-400">• {formatTimeAgo(post.created_at)}</span>
                  </div>
                  {post.content && (
                    <p className="text-xs text-neutral-600 line-clamp-2">{post.content.substring(0, 100)}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Preview version of ActivityFeedWidget
export function ActivityFeedWidgetPreview() {
  const [activities] = useState([
    { id: 1, text: "Sabrina Shah marked a Lesson as complete", time: "1m ago" },
    { id: 2, text: "UES Club marked an Invoice as paid", time: "2m ago" },
    { id: 3, text: "UES Club marked a Lesson as complete", time: "2m ago" },
  ]);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BoltIcon className="h-4 w-4 text-brand-cyan" />
          <h3 className="text-sm font-bold text-neutral-900">Activity Feed</h3>
        </div>
      </div>
      <div className="space-y-2">
        {activities.map((activity) => (
          <div key={activity.id} className="flex items-start gap-2 pb-2 border-b border-neutral-100 last:border-0">
            <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-brand-cyan mt-1.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-neutral-600">{activity.text}</p>
              <p className="text-xs text-neutral-400 mt-0.5">{activity.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Preview version of UpcomingLessonsWidget
export function UpcomingLessonsWidgetPreview() {
  const [lessons] = useState([
    { id: 1, client: "Courtney Statfeld", type: "Chess - Home - 1:1 (Parker)", date: "11/22/2025", time: "12:30 PM" },
    { id: 2, client: "Courtney Statfeld", type: "Chess - Home - 1:1...", date: "11/22/2025", time: "01:00 PM" },
  ]);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ClockIcon className="h-4 w-4 text-brand-orange" />
          <h3 className="text-sm font-bold text-neutral-900">Upcoming Lessons</h3>
        </div>
      </div>
      <div className="space-y-2">
        {lessons.map((lesson) => (
          <div key={lesson.id} className="flex items-start gap-2 pb-2 border-b border-neutral-100 last:border-0">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-lg bg-brand-light flex items-center justify-center">
                <CalendarIcon className="h-4 w-4 text-brand-purple" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-neutral-900">{lesson.client}</p>
              <p className="text-xs text-neutral-500 mt-0.5">{lesson.type}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Preview version of QuickAccessCard
export function QuickAccessWidgetPreview() {
  const quickAccessItems = [
    { title: 'Tutors', icon: AcademicCapIcon },
    { title: 'Clients', icon: UsersIcon },
    { title: 'Students', icon: UserGroupIcon },
    { title: 'Jobs', icon: BriefcaseIcon },
    { title: 'Lessons', icon: CalendarIcon },
  ];

  return (
    <div className="p-4 h-full flex flex-col">
      <h2 className="text-sm font-semibold text-neutral-700 mb-3 leading-tight">Quick Access</h2>
      <div className="flex md:grid md:grid-cols-5 gap-3 flex-1">
        {quickAccessItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div
              key={idx}
              className="group flex flex-col items-center justify-center text-center bg-white rounded-xl shadow-sm border border-neutral-200 p-4 h-24 hover:shadow-md hover:border-brand-purple transition-all duration-200"
            >
              <div className="p-2.5 rounded-lg bg-gradient-to-br from-brand-light to-white border border-neutral-100 mb-2">
                <Icon className="h-5 w-5 text-brand-purple" />
              </div>
              <div className="flex-1 flex flex-col justify-center min-w-0 w-full">
                <h4 className="text-sm font-semibold text-neutral-900 group-hover:text-brand-navy transition-colors leading-tight">
                  {item.title}
                </h4>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Preview version of AnalyticsWidget
export function AnalyticsWidgetPreview() {
  return (
    <div className="p-4">
      <h3 className="text-xs font-bold text-neutral-700 mb-2">Key Metrics</h3>
      <div className="grid grid-cols-4 gap-2">
        {[
          { title: "Clients", value: "131" },
          { title: "Enquiries", value: "0" },
          { title: "Tutors", value: "9" },
          { title: "Invites", value: "0" },
        ].map((metric, idx) => (
          <div key={idx} className="text-center p-2 bg-neutral-50 rounded">
            <p className="text-lg font-bold text-neutral-900">{metric.value}</p>
            <p className="text-xs text-neutral-500">{metric.title}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Main preview renderer
export function WidgetPreviewRenderer({ widgetType }) {
  switch (widgetType) {
    case 'tasks':
      return <TaskWidgetPreview />;
    case 'news-feed':
      return <NewsFeedWidgetPreview />;
    case 'activity-feed':
      return <ActivityFeedWidgetPreview />;
    case 'upcoming-lessons':
      return <UpcomingLessonsWidgetPreview />;
    case 'quick-access':
      return <QuickAccessWidgetPreview />;
    case 'analytics':
      return <AnalyticsWidgetPreview />;
    default:
      return <div className="p-4 text-xs text-neutral-400">Preview not available</div>;
  }
}
