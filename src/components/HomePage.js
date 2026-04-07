import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { Link, useNavigate } from "react-router-dom";
import CreatePostModal from "./CreatePostModal";
import PostReactions from "./PostReactions";
import PostComments from "./PostComments";
import PostActionsMenu from "./PostActionsMenu";
import EditPostModal from "./EditPostModal";
import { RoleProvider, useRole } from "../contexts/RoleContext";
import { BranchProvider, useBranch } from "../contexts/BranchContext";
import ConfigurableWidget from "./ConfigurableWidget";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useToast } from '../hooks/useToast';
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
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import { formatDate } from '../utils/formatters';
import {
  ChartBarIcon as ChartBarIconSolid,
} from "@heroicons/react/20/solid";

/**
 * HomePage - Main Operations Hub Landing Page
 * 
 * Refactored for pixel-perfect alignment, spacing, and visual hierarchy.
 * Uses standardized spacing scale (8/16/24/32px) and consistent typography.
 */

// Task Widget Component
const TaskWidget = memo(function TaskWidget() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        due_soon: 'true'
      });

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

  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ClipboardDocumentListIcon className="h-5 w-5 text-brand-purple" />
          <h3 className="text-lg font-semibold text-neutral-900 leading-tight">My Tasks</h3>
        </div>
        <Link
          to="/tasks"
          className="text-sm font-medium text-brand-purple hover:text-brand-navy transition-colors"
        >
          View all →
        </Link>
      </div>
      <div className="space-y-3">
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
                  <h4 className="text-sm font-medium text-neutral-900 truncate">{task.name}</h4>
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
});

const ActivityFeedWidget = memo(function ActivityFeedWidget() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivities();
    // Set up polling for real-time updates every 30 seconds
    const interval = setInterval(fetchActivities, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchActivities = async () => {
    try {
      setLoading(true);
      // Fetch last 24 hours of activity
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 1);

      const params = new URLSearchParams({
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        limit: '10',
        offset: '0',
      });

      const response = await fetch(`/api/activity/feed?${params}`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setActivities(data.activities || []);
      }
    } catch (error) {
      console.error('Error fetching activity feed:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (dateString) => {
    if (!dateString) return 'Unknown time';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  const formatActivityText = (activity) => {
    const actor = activity.actor_name || 'Someone';
    const action = activity.title || 'performed an action';
    const description = activity.description || '';
    return `${actor} • ${action}${description ? ': ' + description : ''}`;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BoltIcon className="h-5 w-5 text-brand-cyan" />
          <h3 className="text-lg font-semibold text-neutral-900 leading-tight">Activity Feed</h3>
        </div>
        <Link
          to="/home/activity"
          className="text-sm font-medium text-brand-purple hover:text-brand-navy transition-colors"
        >
          View more →
        </Link>
      </div>
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-8 text-neutral-500">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-brand-purple"></div>
            <p className="text-sm mt-2 leading-relaxed">Loading activity...</p>
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-8 px-4 bg-gradient-to-br from-brand-light/30 to-white rounded-lg border border-neutral-100">
            <p className="text-sm font-medium text-neutral-700 leading-relaxed">
              No recent activity.
            </p>
            <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
              Activity updates will appear here as they happen.
            </p>
          </div>
        ) : (
          activities.map((activity) => (
            <div key={`${activity.activity_type}-${activity.id}`} className="flex items-start gap-3 pb-3 border-b border-neutral-100 last:border-0 last:pb-0">
              <div className="flex-shrink-0 w-2 h-2 rounded-full bg-brand-cyan mt-2" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-neutral-700 leading-relaxed">{formatActivityText(activity)}</p>
                <p className="text-xs text-neutral-500 mt-1 leading-relaxed">{formatTimeAgo(activity.timestamp)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});

const NewsFeedWidget = memo(function NewsFeedWidget() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const { currentRole } = useRole();
  const { currentBranch } = useBranch();
  
  // Fetch current user
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const response = await fetch('/api/me', { credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          setCurrentUser(data.user || data);
        }
      } catch (error) {
        console.error('Error fetching current user:', error);
      }
    };
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [currentRole, currentBranch]);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: '1',
        limit: '5',
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

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
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
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 flex flex-col hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <NewspaperIcon className="h-5 w-5 text-brand-green" />
          <h3 className="text-lg font-semibold text-neutral-900 leading-tight">Company News Feed</h3>
        </div>
        <Link
          to="/communications/news"
          className="text-sm font-medium text-brand-purple hover:text-brand-navy transition-colors"
        >
          View all →
        </Link>
      </div>
      {loading ? (
        <div className="text-center py-8 text-neutral-500">
          <p className="text-sm leading-relaxed">Loading posts...</p>
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-8 px-4 bg-gradient-to-br from-brand-light/30 to-white rounded-lg border border-neutral-100">
          <p className="text-sm font-medium text-neutral-700 leading-relaxed">
            No posts yet. Be the first to share something!
          </p>
          <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
            Create a post to keep your team updated.
          </p>
        </div>
      ) : (
        <div className="space-y-4 flex-1">
          {posts.slice(0, 1).map((post) => {
            const hasMedia = post.media_urls && Array.isArray(post.media_urls) && post.media_urls.length > 0;
            const isLongContent = post.content && post.content.length > (hasMedia ? 150 : 200);
            const previewContent = isLongContent ? post.content.substring(0, hasMedia ? 150 : 200) + '...' : post.content;
            const textLines = hasMedia ? 2 : 3;
            
            return (
              <div key={post.id} className="pb-4 border-b border-neutral-100 last:border-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <img
                    src={post.author_image_url || "/logo512.png"}
                    alt={getAuthorName(post)}
                    className="w-10 h-10 rounded-full object-contain bg-brand-light flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-neutral-900 leading-tight">{getAuthorName(post)}</span>
                        <span className="text-xs text-neutral-500 leading-relaxed">• {formatTimeAgo(post.created_at)}</span>
                      </div>
                      <PostActionsMenu
                        post={post}
                        currentUserId={currentUser?.id?.toString() || currentUser?.email}
                        onEdit={(post) => setEditingPost(post)}
                        onDelete={(postId) => {
                          setPosts(posts.filter(p => p.id !== postId));
                        }}
                      />
                    </div>
                    {post.content && (
                      <div className="mt-2">
                        <p 
                          className="text-sm text-neutral-700 leading-relaxed break-words whitespace-pre-wrap"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: textLines,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {previewContent}
                        </p>
                        {isLongContent && (
                          <Link
                            to="/communications/news"
                            className="text-sm font-medium text-brand-purple hover:text-brand-navy mt-2 inline-block transition-colors"
                          >
                            Read more →
                          </Link>
                        )}
                      </div>
                    )}
                    {hasMedia && (
                      <div className="mt-3">
                        {post.media_urls.slice(0, 1).map((url, idx) => (
                          <div key={idx} className="rounded-lg overflow-hidden bg-neutral-100">
                            {url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                              <img
                                src={url}
                                alt={`Post media ${idx + 1}`}
                                className="w-full h-auto object-contain rounded-lg max-h-48"
                                loading="lazy"
                              />
                            ) : url.match(/\.(mp4|webm|ogg)$/i) ? (
                              <video 
                                src={url} 
                                controls 
                                className="w-full h-auto rounded-lg max-h-48"
                              />
                            ) : null}
                          </div>
                        ))}
                        {post.media_urls.length > 1 && (
                          <Link
                            to="/communications/news"
                            className="text-sm font-medium text-brand-purple hover:text-brand-navy mt-2 inline-block transition-colors"
                          >
                            +{post.media_urls.length - 1} more {post.media_urls.length === 2 ? 'image' : 'images'} →
                          </Link>
                        )}
                      </div>
                    )}
                    
                    {/* Reactions and Comments */}
                    <div className="mt-3 flex items-center gap-4 text-sm text-neutral-600">
                      <PostReactions 
                        post={post} 
                        onReactionUpdate={() => {
                          fetchPosts();
                        }}
                      />
                      <Link
                        to="/communications/news"
                        className="flex items-center gap-1.5 text-neutral-600 hover:text-neutral-900 transition-colors"
                      >
                        <ChatBubbleLeftIcon className="h-5 w-5" />
                        <span className="text-sm leading-relaxed">{post.comment_count || 0}</span>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <button 
        onClick={() => setShowCreateModal(true)}
        className="mt-4 w-full py-2.5 text-sm font-medium text-brand-purple hover:bg-brand-light rounded-lg transition-colors min-h-[44px]"
      >
        + Create Post
      </button>
      
      <CreatePostModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onPostCreated={(newPost) => {
          setPosts([newPost, ...posts]);
          setShowCreateModal(false);
        }}
      />
      
      <EditPostModal
        isOpen={!!editingPost}
        onClose={() => setEditingPost(null)}
        post={editingPost}
        onPostUpdated={(updatedPost) => {
          setPosts(posts.map(p => p.id === updatedPost.id ? updatedPost : p));
          setEditingPost(null);
        }}
      />
    </div>
  );
});

const AnalyticsWidget = memo(function AnalyticsWidget({ title, value, subtitle, trend, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {Icon && <Icon className={`h-5 w-5 ${color || "text-brand-purple"}`} />}
          <h4 className="text-sm font-medium text-neutral-600 uppercase tracking-wide leading-tight">{title}</h4>
        </div>
      </div>
      <div className="mb-2">
        <p className="text-3xl font-bold text-neutral-900 leading-tight">{value}</p>
        {subtitle && (
          <p className="text-sm text-neutral-500 mt-1 leading-relaxed">{subtitle}</p>
        )}
      </div>
      {trend && (
        <div className="flex items-center gap-1 mt-2">
          <span className={`text-sm font-medium leading-tight ${trend.positive ? "text-brand-green" : "text-red-500"}`}>
            {trend.positive ? "↑" : "↓"} {trend.value}
          </span>
          <span className="text-xs text-neutral-500 leading-relaxed">{trend.period}</span>
        </div>
      )}
    </div>
  );
});

const UpcomingLessonsWidget = memo(function UpcomingLessonsWidget() {
  // Using hardcoded data for now - can be replaced with API call later
  const [lessons] = useState([
    { id: 1, client: "Courtney Statfeld", type: "Chess - Home - 1:1 (Parker)", date: "11/22/2025", time: "12:30 PM" },
    { id: 2, client: "Courtney Statfeld", type: "Chess - Home - 1:1...", date: "11/22/2025", time: "01:00 PM" },
    { id: 3, client: "Brittany Sukiennik", type: "Chess - Home - Siblings", date: "11/22/2025", time: "01:00 PM" },
    { id: 4, client: "Veronica Lee", type: "Chess - Home - 1:1 (Belle)", date: "11/22/2025", time: "01:00 PM" },
  ]);
  
  // For placeholder when empty, use empty array
  const displayLessons = lessons || [];

  const formatDateTime = (date, time) => {
    try {
      const [month, day, year] = date.split('/');
      const dateObj = new Date(`${year}-${month}-${day} ${time}`);
      return dateObj.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
      }) + ' • ' + dateObj.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit' 
      });
    } catch {
      return `${date} • ${time}`;
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ClockIcon className="h-5 w-5 text-brand-orange" />
          <h3 className="text-lg font-semibold text-neutral-900 leading-tight">Upcoming Lessons</h3>
        </div>
        <Link
          to="/lessons"
          className="text-sm font-medium text-brand-purple hover:text-brand-navy transition-colors"
        >
          View all →
        </Link>
      </div>
      <div className="space-y-3">
        {displayLessons.length === 0 ? (
          <div className="text-center py-8 px-4 bg-gradient-to-br from-brand-light/30 to-white rounded-lg border border-neutral-100">
            <p className="text-sm font-medium text-neutral-700 leading-relaxed">
              No upcoming lessons scheduled.
            </p>
            <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
              Your upcoming lessons will appear here.
            </p>
          </div>
        ) : (
          displayLessons.map((lesson) => (
            <div key={lesson.id} className="flex items-start gap-3 pb-3 border-b border-neutral-100 last:border-0 last:pb-0">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-lg bg-brand-light flex items-center justify-center">
                  <CalendarIcon className="h-6 w-6 text-brand-purple" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900 leading-tight">{lesson.client}</p>
                <p className="text-xs text-neutral-600 mt-1 leading-relaxed">{lesson.type}</p>
                <p className="text-xs text-neutral-500 mt-1 leading-relaxed">{formatDateTime(lesson.date, lesson.time)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});

const QuickAccessCard = memo(function QuickAccessCard({ to, icon: Icon, title, description, color }) {
  return (
    <Link
      to={to}
      className="group flex flex-col items-center justify-center text-center bg-white rounded-xl shadow-sm border border-neutral-200 p-4 h-24 hover:shadow-md hover:border-brand-purple transition-all duration-200"
    >
      <div className={`p-2.5 rounded-lg bg-gradient-to-br ${color || "from-brand-light to-white"} border border-neutral-100 mb-2`}>
        <Icon className="h-5 w-5 text-brand-purple" />
      </div>
      <div className="flex-1 flex flex-col justify-center min-w-0 w-full">
        <h4 className="text-sm font-semibold text-neutral-900 group-hover:text-brand-navy transition-colors leading-tight">
          {title}
        </h4>
        {description && (
          <p className="text-xs text-neutral-600 mt-0.5 leading-relaxed line-clamp-1">{description}</p>
        )}
      </div>
    </Link>
  );
});

function HomePageContent() {
  const toast = useToast();
  const [layoutConfig, setLayoutConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configMode, setConfigMode] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Load saved layout configuration
    loadLayoutConfig();
  }, []);

  const loadLayoutConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/home-page-config', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.config && data.config.layout_config && data.config.layout_config.length > 0) {
          console.log('Loaded layout config:', data.config.layout_config);
          setLayoutConfig(data.config.layout_config);
        } else {
          // If no saved config, set to empty array so we use defaults
          console.log('No saved layout config, using defaults');
          setLayoutConfig([]);
        }
      }
    } catch (error) {
      console.error('Error loading layout config:', error);
      setLayoutConfig([]);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  // Default widget configuration
  const defaultWidgets = useMemo(() => [
    { id: 'quick-access', component: 'QuickAccess', visible: true, order: 0 },
    { id: 'news-feed', component: 'NewsFeed', visible: true, order: 1 },
    { id: 'tasks', component: 'Tasks', visible: true, order: 2 },
    { id: 'upcoming-lessons', component: 'UpcomingLessons', visible: true, order: 3 },
    { id: 'activity-feed', component: 'ActivityFeed', visible: true, order: 4 },
    { id: 'analytics', component: 'Analytics', visible: true, order: 5 },
    { id: 'performance-overview', component: 'PerformanceOverview', visible: true, order: 6 },
  ], []);

  // Get widget visibility and order from saved config
  const getWidgetConfig = useCallback((widgetId) => {
    if (!layoutConfig || layoutConfig.length === 0) {
      const defaultOrder = defaultWidgets.findIndex(w => w.id === widgetId);
      return { visible: true, order: defaultOrder >= 0 ? defaultOrder : 999 };
    }
    const saved = layoutConfig.find(w => w.id === widgetId);
    if (!saved) {
      const defaultOrder = defaultWidgets.findIndex(w => w.id === widgetId);
      return { visible: true, order: defaultOrder >= 0 ? defaultOrder : 999 };
    }
    return {
      visible: saved.visible !== false,
      order: saved.order !== undefined ? saved.order : 999
    };
  }, [layoutConfig, defaultWidgets]);

  // Get all widget configs - recompute when layoutConfig changes
  const newsFeedConfig = useMemo(() => getWidgetConfig('news-feed'), [getWidgetConfig]);
  const tasksConfig = useMemo(() => getWidgetConfig('tasks'), [getWidgetConfig]);
  const lessonsConfig = useMemo(() => getWidgetConfig('upcoming-lessons'), [getWidgetConfig]);
  const activityConfig = useMemo(() => getWidgetConfig('activity-feed'), [getWidgetConfig]);
  const analyticsConfig = useMemo(() => getWidgetConfig('analytics'), [getWidgetConfig]);
  const performanceConfig = useMemo(() => getWidgetConfig('performance-overview'), [getWidgetConfig]);

  // Default widget definitions
  const defaultWidgetDefs = useMemo(() => [
    { id: 'quick-access', type: 'quick-access', w: 12, h: 2, minW: 6, minH: 2, visible: true, x: 0, y: 0 },
    { id: 'news-feed', type: 'news-feed', w: 12, h: 4, minW: 6, minH: 3, visible: true, x: 0, y: 2 },
    { id: 'tasks', type: 'tasks', w: 6, h: 4, minW: 4, minH: 3, visible: true, x: 0, y: 6 },
    { id: 'upcoming-lessons', type: 'upcoming-lessons', w: 6, h: 4, minW: 4, minH: 3, visible: true, x: 6, y: 6 },
    { id: 'activity-feed', type: 'activity-feed', w: 12, h: 3, minW: 6, minH: 2, visible: true, x: 0, y: 10 },
    { id: 'analytics', type: 'analytics', w: 12, h: 2, minW: 6, minH: 2, visible: true, x: 0, y: 13 },
    { id: 'performance-overview', type: 'performance-overview', w: 12, h: 4, minW: 6, minH: 3, visible: true, x: 0, y: 15 },
  ], []);

  // Initialize widgets from saved config or defaults
  const initializeWidgets = useCallback(() => {
    let widgets;
    if (layoutConfig && layoutConfig.length > 0) {
      // Merge saved config with defaults, preserving saved positions
      widgets = defaultWidgetDefs.map(def => {
        const saved = layoutConfig.find(w => w.id === def.id);
        if (saved) {
          // Preserve all saved properties including x, y, w, h
          return { ...def, ...saved, visible: saved.visible !== false };
        }
        return def;
      });
    } else {
      // If no saved config, use defaults which have tasks and lessons side-by-side
      widgets = defaultWidgetDefs;
    }
    
    // Always ensure tasks and lessons are side-by-side with correct dimensions
    const tasksWidget = widgets.find(w => w.id === 'tasks');
    const lessonsWidget = widgets.find(w => w.id === 'upcoming-lessons');
    
    if (tasksWidget && lessonsWidget && tasksWidget.visible && lessonsWidget.visible) {
      // Find the y position where they should be
      const newsFeedWidget = widgets.find(w => w.id === 'news-feed');
      const newsFeedBottom = newsFeedWidget && newsFeedWidget.visible 
        ? (newsFeedWidget.y || 2) + (newsFeedWidget.h || 4)
        : 6;
      
      const targetY = Math.max(newsFeedBottom, Math.min(tasksWidget.y || 6, lessonsWidget.y || 6));
      
      // Always set to side-by-side layout
      tasksWidget.x = 0;
      tasksWidget.w = 6;
      tasksWidget.y = targetY;
      tasksWidget.h = tasksWidget.h || 4;  // Preserve saved height or use default
      
      lessonsWidget.x = 6;
      lessonsWidget.w = 6;
      lessonsWidget.y = targetY;
      lessonsWidget.h = lessonsWidget.h || 4;  // Preserve saved height or use default
      
      // Position activity-feed directly below
      const activityWidget = widgets.find(w => w.id === 'activity-feed');
      if (activityWidget && activityWidget.visible) {
        activityWidget.y = targetY + Math.max(tasksWidget.h || 4, lessonsWidget.h || 4);
        activityWidget.x = 0;
        activityWidget.w = 12;
      }
    }

    return widgets;
  }, [layoutConfig, defaultWidgetDefs]);

  // Config mode state and handlers
  const [widgets, setWidgets] = useState(initializeWidgets);
  
  // Update widgets when config loads (but not when entering config mode)
  useEffect(() => {
    if (!loadingConfig && !configMode) {
      const initialized = initializeWidgets();
      // If we have saved config, use it; otherwise use defaults
      if (!layoutConfig || layoutConfig.length === 0) {
        // No saved config - use defaults with tasks and lessons side-by-side
        setWidgets(defaultWidgetDefs);
      } else {
        setWidgets(initialized);
      }
    }
  }, [layoutConfig, loadingConfig, configMode, initializeWidgets, defaultWidgetDefs]);
  
  // When entering config mode, ensure widgets match current visual state
  useEffect(() => {
    if (configMode && !loadingConfig) {
      setWidgets((currentWidgets) => {
        // Start with current widgets or initialize
        const widgets = currentWidgets && currentWidgets.length > 0 
          ? currentWidgets.map(w => ({ ...w }))
          : initializeWidgets();
        
        // Always ensure tasks and lessons are side-by-side
        const tasksWidget = widgets.find(w => w.id === 'tasks');
        const lessonsWidget = widgets.find(w => w.id === 'upcoming-lessons');
        
        if (tasksWidget && lessonsWidget && tasksWidget.visible && lessonsWidget.visible) {
          // Find widgets that should be above tasks/lessons (in order)
          const orderedWidgets = widgets
            .filter(w => w.visible)
            .sort((a, b) => {
              // Sort by order if available, otherwise by y
              if (a.order !== undefined && b.order !== undefined) {
                return a.order - b.order;
              }
              if (a.y !== b.y) return a.y - b.y;
              return a.x - b.x;
            });
          
          // Find the position of tasks/lessons in the ordered list
          const tasksIndex = orderedWidgets.findIndex(w => w.id === 'tasks');
          const lessonsIndex = orderedWidgets.findIndex(w => w.id === 'upcoming-lessons');
          const firstIndex = Math.min(tasksIndex, lessonsIndex);
          
          // Calculate targetY based on widgets before tasks/lessons
          let targetY = 0;
          if (firstIndex > 0) {
            // Find the bottom of the last widget before tasks/lessons
            const beforeWidgets = orderedWidgets.slice(0, firstIndex);
            const lastWidget = beforeWidgets[beforeWidgets.length - 1];
            if (lastWidget) {
              // If last widget is side-by-side, use the max bottom
              const sideBySideWidgets = beforeWidgets.filter(w => w.y === lastWidget.y);
              const maxBottom = Math.max(...sideBySideWidgets.map(w => (w.y || 0) + (w.h || 2)));
              targetY = maxBottom;
            }
          }
          
          // If no widgets before, use default position after news-feed
          if (targetY === 0) {
            const newsFeedWidget = widgets.find(w => w.id === 'news-feed');
            targetY = newsFeedWidget && newsFeedWidget.visible 
              ? (newsFeedWidget.y || 2) + (newsFeedWidget.h || 4)
              : 6;
          }
          
          // ALWAYS set to side-by-side layout
          tasksWidget.x = 0;
          tasksWidget.w = 6;
          tasksWidget.y = targetY;
          tasksWidget.h = 4;
          
          lessonsWidget.x = 6;
          lessonsWidget.w = 6;
          lessonsWidget.y = targetY;  // Same row as tasks
          lessonsWidget.h = 4;
          
          // Position activity-feed directly below (no gap)
          const activityWidget = widgets.find(w => w.id === 'activity-feed');
          if (activityWidget && activityWidget.visible) {
            activityWidget.y = targetY + 4;  // Directly below tasks/lessons row
            activityWidget.x = 0;
            activityWidget.w = 12;
            activityWidget.h = activityWidget.h || 3;
          }
        }
        
        return widgets;
      });
    }
  }, [configMode, loadingConfig, initializeWidgets]);

  const [activeId, setActiveId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [overId, setOverId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = useCallback((event) => {
    setActiveId(event.active.id);
  }, []);

  const handleDragOver = useCallback((event) => {
    const { over } = event;
    setOverId(over ? over.id : null);
  }, []);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);

    if (over && active.id !== over.id) {
      setWidgets((items) => {
        const visibleItems = items.filter(w => w.visible);
        const hiddenItems = items.filter(w => !w.visible);
        
        const oldIndex = visibleItems.findIndex((item) => item.id === active.id);
        const newIndex = visibleItems.findIndex((item) => item.id === over.id);
        
        if (oldIndex === -1 || newIndex === -1) return items;
        
        const reordered = arrayMove(visibleItems, oldIndex, newIndex);
        
        // Recalculate positions while preserving side-by-side layouts
        const reorderedWithPositions = [];
        let currentY = 0;
        
        for (let i = 0; i < reordered.length; i++) {
          const widget = reordered[i];
          const prevWidget = i > 0 ? reorderedWithPositions[i - 1] : null;
          
          // Check if this widget should be side-by-side with the previous one
          // (tasks and lessons should always be side-by-side if both visible)
          const isTasks = widget.id === 'tasks';
          const isLessons = widget.id === 'upcoming-lessons';
          const prevIsTasks = prevWidget?.id === 'tasks';
          const prevIsLessons = prevWidget?.id === 'upcoming-lessons';
          
          if ((isTasks && prevIsLessons) || (isLessons && prevIsTasks)) {
            // Place side-by-side with previous widget
            if (isTasks) {
              reorderedWithPositions.push({
                ...widget,
                x: 0,
                w: 6,
                y: prevWidget.y,
                h: widget.h || 4
              });
            } else {
              reorderedWithPositions.push({
                ...widget,
                x: 6,
                w: 6,
                y: prevWidget.y,
                h: widget.h || 4
              });
            }
          } else {
            // Calculate y position based on previous widget's bottom
            if (prevWidget) {
              // If previous was part of a side-by-side pair, use the bottom of that row
              if (prevIsTasks || prevIsLessons) {
                // Find the other widget in the pair
                const pairWidget = reorderedWithPositions.find(w => 
                  (prevIsTasks && w.id === 'upcoming-lessons') || 
                  (prevIsLessons && w.id === 'tasks')
                );
                if (pairWidget) {
                  currentY = Math.max(prevWidget.y + (prevWidget.h || 4), pairWidget.y + (pairWidget.h || 4));
                } else {
                  currentY = prevWidget.y + (prevWidget.h || 4);
                }
              } else {
                currentY = prevWidget.y + (prevWidget.h || 4);
              }
            }
            
            // Preserve x and w, but set y
            reorderedWithPositions.push({
              ...widget,
              y: currentY,
              x: widget.x !== undefined ? widget.x : 0,
              w: widget.w !== undefined ? widget.w : 12,
              h: widget.h || (widget.type === 'tasks' || widget.type === 'upcoming-lessons' ? 4 : 2)
            });
          }
        }
        
        return [...reorderedWithPositions, ...hiddenItems];
      });
    }
  }, []);

  const handleResize = useCallback((widgetId, dimension, delta) => {
    setWidgets((items) => {
      return items.map((widget) => {
        if (widget.id === widgetId) {
          const newValue = Math.max(
            widget.minW && dimension === 'w' ? widget.minW : (widget.minH && dimension === 'h' ? widget.minH : 1),
            Math.min(
              dimension === 'w' ? 12 : 10,
              widget[dimension] + delta
            )
          );
          return { ...widget, [dimension]: newValue };
        }
        return widget;
      });
    });
  }, []);

  const handleSaveConfig = useCallback(async () => {
    setSaving(true);
    try {
      const layoutConfig = widgets
        .filter(w => w.visible)
        .sort((a, b) => {
          if (a.y !== b.y) return a.y - b.y;
          return a.x - b.x;
        })
        .map((w, index) => ({
          id: w.id,
          type: w.type,
          x: w.x,
          y: w.y,
          w: w.w,
          h: w.h,
          visible: w.visible,
          order: index,
        }));

      const response = await fetch('/api/home-page-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ layout_config: layoutConfig }),
      });

      if (response.ok) {
        // Reload config from server first to get the saved data
        await loadLayoutConfig();
        // Exit config mode - this will trigger re-render with saved layout
        setConfigMode(false);
      } else {
        const error = await response.json();
        toast.error(`Failed to save: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }, [widgets, loadLayoutConfig, toast]);

  const handleCancelConfig = useCallback(() => {
    setConfigMode(false);
    // Reset widgets to saved config
    loadLayoutConfig();
  }, [loadLayoutConfig]);

  return (
    <>
      {/* Main Content Container - Centered with max-width */}
      <div className="max-w-7xl mx-auto w-full relative px-4 sm:px-6 lg:px-8 py-6">
        {/* Quick Access Section */}
        {configMode ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={() => {
              setActiveId(null);
              setOverId(null);
            }}
          >
            <SortableContext
              items={widgets.filter(w => w.visible).map(w => w.id)}
              strategy={undefined}
            >
              <div className="grid grid-cols-12 gap-4">
                {widgets
                  .filter(w => w.visible)
                  .sort((a, b) => {
                    if (a.y !== b.y) return a.y - b.y;
                    return a.x - b.x;
                  })
                  .map((widget) => {
                    const gridRowStart = widget.y + 1;
                    const gridRowEnd = widget.y + (widget.h || 2) + 1;
                    const gridColStart = (widget.x || 0) + 1;
                    const gridColEnd = (widget.x || 0) + (widget.w || 12) + 1;

                    return (
                      <div
                        key={widget.id}
                        className="relative"
                        style={{
                          gridColumn: `${gridColStart} / ${gridColEnd}`,
                          gridRow: `${gridRowStart} / ${gridRowEnd}`,
                        }}
                      >
                        {/* Drop indicator - shows where widget will land */}
                        {overId === widget.id && activeId !== widget.id && (
                          <div className="absolute -top-2 left-0 right-0 h-1 bg-brand-purple rounded-full z-30 animate-pulse" />
                        )}
                        <ConfigurableWidget
                          id={widget.id}
                          widget={widget}
                          configMode={configMode}
                          onResize={handleResize}
                          onToggleVisibility={(id) => {
                            setWidgets(items => items.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
                          }}
                        >
                          {widget.id === 'quick-access' && (
                            <section>
                              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
                                <h2 className="text-sm font-semibold text-neutral-700 mb-3 leading-tight">Quick Access</h2>
                                <div className="flex md:grid md:grid-cols-5 gap-3 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 -mx-1 px-1 md:mx-0 md:px-0 scrollbar-hide">
                                  <QuickAccessCard to="/tutors" icon={AcademicCapIcon} title="Tutors" color="from-brand-light to-white" />
                                  <QuickAccessCard to="/clients" icon={UsersIcon} title="Clients" color="from-brand-light to-white" />
                                  <QuickAccessCard to="/students" icon={UserGroupIcon} title="Students" color="from-brand-light to-white" />
                                  <QuickAccessCard to="/jobs" icon={BriefcaseIcon} title="Jobs" color="from-brand-light to-white" />
                                  <QuickAccessCard to="/lessons" icon={CalendarIcon} title="Lessons" color="from-brand-light to-white" />
                                </div>
                              </div>
                            </section>
                          )}
                          {widget.id === 'news-feed' && <NewsFeedWidget />}
                          {widget.id === 'tasks' && <TaskWidget />}
                          {widget.id === 'upcoming-lessons' && <UpcomingLessonsWidget />}
                          {widget.id === 'activity-feed' && <ActivityFeedWidget />}
                          {widget.id === 'analytics' && (
                            <section>
                              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
                                <div className="flex items-center justify-between mb-4">
                                  <h2 className="text-lg font-semibold text-neutral-900 leading-tight">Key Metrics</h2>
                                  <Link to="/analytics/overview" className="text-sm font-medium text-brand-purple hover:text-brand-navy transition-colors">
                                    View full analytics →
                                  </Link>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                  <AnalyticsWidget title="Clients Created" value="131" subtitle="Past 28 days" trend={{ positive: true, value: "21%", period: "vs last 28 days" }} icon={UsersIcon} color="text-brand-green" />
                                  <AnalyticsWidget title="Enquiries" value="0" subtitle="Past 28 days" trend={{ positive: true, value: "0%", period: "vs last 28 days" }} icon={BoltIcon} color="text-brand-cyan" />
                                  <AnalyticsWidget title="Tutors Created" value="9" subtitle="Past 28 days" trend={{ positive: true, value: "350%", period: "vs last 28 days" }} icon={AcademicCapIcon} color="text-brand-purple" />
                                  <AnalyticsWidget title="Interview Invites" value="0" subtitle="Past 28 days" trend={{ positive: true, value: "0%", period: "vs last 28 days" }} icon={ChartBarIconSolid} color="text-brand-orange" />
                                </div>
                              </div>
                            </section>
                          )}
                          {widget.id === 'performance-overview' && (
                            <section>
                              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
                                <h2 className="text-lg font-semibold text-neutral-900 mb-4 leading-tight">Performance Overview</h2>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                                  <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
                                    <h3 className="text-base font-semibold text-neutral-900 mb-4 leading-tight">Lesson Hours</h3>
                                    <div className="h-64 flex items-center justify-center text-neutral-400">
                                      <p className="text-sm leading-relaxed">Chart placeholder - Will integrate existing analytics charts</p>
                                    </div>
                                  </div>
                                  <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
                                    <h3 className="text-base font-semibold text-neutral-900 mb-4 leading-tight">New Jobs</h3>
                                    <div className="h-64 flex items-center justify-center text-neutral-400">
                                      <p className="text-sm leading-relaxed">Chart placeholder - Will integrate existing analytics charts</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </section>
                          )}
                        </ConfigurableWidget>
                      </div>
                    );
                  })}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeId ? (
                <div className="opacity-50 bg-white rounded-xl shadow-lg border-2 border-brand-purple p-4">
                  <p className="text-sm font-medium text-neutral-700">Dragging widget...</p>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <>
            <section className="mb-4 sm:mb-6">
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
                <h2 className="text-sm font-semibold text-neutral-700 mb-3 leading-tight">Quick Access</h2>
                {/* Mobile: Horizontal scroll, Desktop: Grid */}
                <div className="flex md:grid md:grid-cols-5 gap-3 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 -mx-1 px-1 md:mx-0 md:px-0 scrollbar-hide">
                  <QuickAccessCard
                    to="/tutors"
                    icon={AcademicCapIcon}
                    title="Tutors"
                    color="from-brand-light to-white"
                  />
                  <QuickAccessCard
                    to="/clients"
                    icon={UsersIcon}
                    title="Clients"
                    color="from-brand-light to-white"
                  />
                  <QuickAccessCard
                    to="/students"
                    icon={UserGroupIcon}
                    title="Students"
                    color="from-brand-light to-white"
                  />
                  <QuickAccessCard
                    to="/jobs"
                    icon={BriefcaseIcon}
                    title="Jobs"
                    color="from-brand-light to-white"
                  />
                  <QuickAccessCard
                    to="/lessons"
                    icon={CalendarIcon}
                    title="Lessons"
                    color="from-brand-light to-white"
                  />
                </div>
              </div>
            </section>

        {/* Main Dashboard Grid - Customizable Layout */}
        {loadingConfig ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
            <p className="mt-4 text-neutral-600">Loading layout...</p>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6" style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Render widgets based on saved configuration order */}
            {/* Sort widgets by order to ensure correct display */}
            {[
              { id: 'news-feed', config: newsFeedConfig, component: <NewsFeedWidget /> },
              { id: 'tasks', config: tasksConfig, component: <TaskWidget /> },
              { id: 'upcoming-lessons', config: lessonsConfig, component: <UpcomingLessonsWidget /> },
              { id: 'activity-feed', config: activityConfig, component: <ActivityFeedWidget /> },
              { 
                id: 'analytics', 
                config: analyticsConfig, 
                component: (
                  <section>
                    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-neutral-900 leading-tight">Key Metrics</h2>
                        <Link
                          to="/analytics/overview"
                          className="text-sm font-medium text-brand-purple hover:text-brand-navy transition-colors"
                        >
                          View full analytics →
                        </Link>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <AnalyticsWidget
                        title="Clients Created"
                        value="131"
                        subtitle="Past 28 days"
                        trend={{ positive: true, value: "21%", period: "vs last 28 days" }}
                        icon={UsersIcon}
                        color="text-brand-green"
                      />
                      <AnalyticsWidget
                        title="Enquiries"
                        value="0"
                        subtitle="Past 28 days"
                        trend={{ positive: true, value: "0%", period: "vs last 28 days" }}
                        icon={BoltIcon}
                        color="text-brand-cyan"
                      />
                      <AnalyticsWidget
                        title="Tutors Created"
                        value="9"
                        subtitle="Past 28 days"
                        trend={{ positive: true, value: "350%", period: "vs last 28 days" }}
                        icon={AcademicCapIcon}
                        color="text-brand-purple"
                      />
                      <AnalyticsWidget
                        title="Interview Invites"
                        value="0"
                        subtitle="Past 28 days"
                        trend={{ positive: true, value: "0%", period: "vs last 28 days" }}
                        icon={ChartBarIconSolid}
                        color="text-brand-orange"
                      />
                    </div>
                    </div>
                  </section>
                )
              },
              {
                id: 'performance-overview',
                config: performanceConfig,
                component: (
                  <section>
                    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
                      <h2 className="text-lg font-semibold text-neutral-900 mb-4 leading-tight">Performance Overview</h2>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
                        <h3 className="text-base font-semibold text-neutral-900 mb-4 leading-tight">Lesson Hours</h3>
                        <div className="h-64 flex items-center justify-center text-neutral-400">
                          <p className="text-sm leading-relaxed">Chart placeholder - Will integrate existing analytics charts</p>
                        </div>
                      </div>
                      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
                        <h3 className="text-base font-semibold text-neutral-900 mb-4 leading-tight">New Jobs</h3>
                        <div className="h-64 flex items-center justify-center text-neutral-400">
                          <p className="text-sm leading-relaxed">Chart placeholder - Will integrate existing analytics charts</p>
                        </div>
                      </div>
                      </div>
                    </div>
                  </section>
                )
              },
            ]
              .filter(item => item.config.visible)
              .sort((a, b) => a.config.order - b.config.order)
              .map((item) => {
                // Special handling for tasks and lessons - render side-by-side if both visible
                if ((item.id === 'tasks' && lessonsConfig.visible) || (item.id === 'upcoming-lessons' && tasksConfig.visible)) {
                  // Only render once when we hit the first of the pair
                  if (item.id === 'tasks') {
                    return (
                      <div 
                        key="tasks-lessons"
                        className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6" 
                        style={{ order: Math.min(tasksConfig.order, lessonsConfig.order) }}
                      >
                        {tasksConfig.visible && <TaskWidget />}
                        {lessonsConfig.visible && <UpcomingLessonsWidget />}
                      </div>
                    );
                  }
                  // Skip rendering lessons here since it's handled above
                  return null;
                }
                return (
                  <div key={item.id} style={{ order: item.config.order }}>
                    {item.component}
                  </div>
                );
              })}
          </div>
        )}

          </>
        )}

        {/* Config Mode Controls - Show when in config mode */}
        {configMode && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">
            <button
              onClick={handleCancelConfig}
              className="px-4 py-2.5 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors text-sm font-medium shadow-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveConfig}
              disabled={saving}
              className="px-4 py-2.5 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors text-sm font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Layout</span>
              )}
            </button>
          </div>
        )}

        {/* Config Button - Fixed Bottom Right */}
        {!configMode && (
          <div className="fixed bottom-6 right-6 z-50">
            <button
              onClick={() => {
                setConfigMode(true);
              }}
              className="inline-flex items-center justify-center p-3 bg-white border border-neutral-300 rounded-full hover:bg-neutral-50 transition-colors min-h-[48px] min-w-[48px] shadow-lg hover:shadow-xl"
              title="Customize Layout"
            >
              <Cog6ToothIcon className="h-6 w-6 flex-shrink-0 text-neutral-700" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function HomePage() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Get user from localStorage
    const userData = localStorage.getItem("user");
    if (userData && userData !== "undefined") {
      try {
        setUser(JSON.parse(userData));
      } catch (e) {
        console.error("Error parsing user data:", e);
      }
    }
  }, []);

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <RoleProvider user={user}>
      <BranchProvider user={user}>
        <HomePageContent />
      </BranchProvider>
    </RoleProvider>
  );
}

export default HomePage;
