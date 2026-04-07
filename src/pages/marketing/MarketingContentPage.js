import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  PhotoIcon,
  MegaphoneIcon,
  PlusIcon,
  ClockIcon,
  CheckCircleIcon,
  FilmIcon,
  RectangleStackIcon,
} from '@heroicons/react/24/outline';

/**
 * MarketingContentPage - Unified Content Calendar
 *
 * Shows all scheduled content (blogs, Instagram posts, campaigns) in a calendar view
 */
export default function MarketingContentPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarDays, setCalendarDays] = useState([]);
  const [scheduledContent, setScheduledContent] = useState({
    blogs: [],
    instagram: [],
    campaigns: [],
  });
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    generateCalendarDays();
    loadScheduledContent();
  }, [currentDate]);

  const generateCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Get first and last day of month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Get day of week for first day (0 = Sunday)
    const startDayOfWeek = firstDay.getDay();

    // Generate days array
    const days = [];

    // Add days from previous month
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthLastDay - i),
        isCurrentMonth: false,
      });
    }

    // Add days of current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }

    // Add days from next month to complete the grid
    const remainingDays = 42 - days.length; // 6 rows x 7 days
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }

    setCalendarDays(days);
  };

  const loadScheduledContent = async () => {
    setLoading(true);
    try {
      const [blogsRes, instagramRes] = await Promise.all([
        fetch('/api/marketing-command-center/blogs'),
        fetch('/api/marketing-command-center/instagram'),
      ]);

      const blogs = blogsRes.ok ? await blogsRes.json() : [];
      const instagram = instagramRes.ok ? await instagramRes.json() : [];

      setScheduledContent({
        blogs: blogs.filter(b => b.status !== 'archived'),
        instagram: instagram.filter(p => p.status !== 'archived'),
        campaigns: [], // Future: load campaign data
      });
    } catch (err) {
      console.error('Error loading content:', err);
    } finally {
      setLoading(false);
    }
  };

  const getContentForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    const content = [];

    // Check blogs (by updated_at for now, since no publish date)
    scheduledContent.blogs.forEach(blog => {
      const blogDate = new Date(blog.updated_at).toISOString().split('T')[0];
      if (blogDate === dateStr && ['pending_review', 'approved', 'published'].includes(blog.status)) {
        content.push({
          type: 'blog',
          id: blog.id,
          title: blog.title?.substring(0, 30) || 'Untitled Blog',
          status: blog.status,
          link: `/marketing/blogs/${blog.id}`,
        });
      }
    });

    // Check Instagram posts
    scheduledContent.instagram.forEach(post => {
      const postDate = post.scheduled_at
        ? new Date(post.scheduled_at).toISOString().split('T')[0]
        : new Date(post.updated_at).toISOString().split('T')[0];
      if (postDate === dateStr && ['scheduled', 'published', 'pending_review', 'approved'].includes(post.status)) {
        content.push({
          type: 'instagram',
          subtype: post.post_type,
          id: post.id,
          title: post.caption?.substring(0, 30) || `${post.post_type} Post`,
          status: post.status,
          link: `/marketing/instagram/${post.id}`,
        });
      }
    });

    return content;
  };

  const navigateMonth = (direction) => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + direction);
      return newDate;
    });
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const formatMonthYear = (date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const getContentIcon = (type, subtype) => {
    if (type === 'blog') {
      return <DocumentTextIcon className="h-3 w-3" />;
    }
    if (type === 'instagram') {
      switch (subtype) {
        case 'carousel':
          return <RectangleStackIcon className="h-3 w-3" />;
        case 'reel':
          return <FilmIcon className="h-3 w-3" />;
        default:
          return <PhotoIcon className="h-3 w-3" />;
      }
    }
    return <MegaphoneIcon className="h-3 w-3" />;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'published':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'scheduled':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'approved':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'pending_review':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      default:
        return 'bg-neutral-100 text-neutral-600 border-neutral-200';
    }
  };

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Get upcoming content for sidebar
  const upcomingContent = [
    ...scheduledContent.instagram
      .filter(p => p.scheduled_at && new Date(p.scheduled_at) > new Date() && p.status === 'scheduled')
      .map(p => ({ ...p, type: 'instagram', date: new Date(p.scheduled_at) })),
  ]
    .sort((a, b) => a.date - b.date)
    .slice(0, 5);

  // Get pending approvals
  const pendingApprovals = [
    ...scheduledContent.blogs.filter(b => b.status === 'pending_review').map(b => ({ ...b, type: 'blog' })),
    ...scheduledContent.instagram.filter(p => p.status === 'pending_review').map(p => ({ ...p, type: 'instagram' })),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Content Calendar</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Plan and schedule all your marketing content in one place
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/marketing/blogs"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-purple text-white text-sm font-medium rounded-lg hover:bg-brand-purple/90"
            >
              <PlusIcon className="h-4 w-4" />
              Blog
            </Link>
            <Link
              to="/marketing/instagram"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-brand-pink to-brand-orange text-white text-sm font-medium rounded-lg hover:opacity-90"
            >
              <PlusIcon className="h-4 w-4" />
              Post
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Calendar */}
          <div className="lg:col-span-3 bg-white rounded-xl border border-neutral-200 overflow-hidden">
            {/* Calendar Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold text-neutral-900">
                  {formatMonthYear(currentDate)}
                </h2>
                <button
                  onClick={goToToday}
                  className="px-2 py-1 text-xs text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded"
                >
                  Today
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigateMonth(-1)}
                  className="p-1 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded"
                >
                  <ChevronLeftIcon className="h-5 w-5" />
                </button>
                <button
                  onClick={() => navigateMonth(1)}
                  className="p-1 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded"
                >
                  <ChevronRightIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Week Day Headers */}
            <div className="grid grid-cols-7 border-b bg-neutral-50">
              {weekDays.map(day => (
                <div key={day} className="p-2 text-center text-xs font-medium text-neutral-500">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin h-8 w-8 border-4 border-neutral-200 border-t-brand-purple rounded-full" />
              </div>
            ) : (
              <div className="grid grid-cols-7">
                {calendarDays.map((day, index) => {
                  const content = getContentForDate(day.date);
                  const dayIsToday = isToday(day.date);

                  return (
                    <div
                      key={index}
                      onClick={() => setSelectedDay(day.date)}
                      className={`min-h-[100px] p-1 border-b border-r cursor-pointer transition-colors
                        ${day.isCurrentMonth ? 'bg-white' : 'bg-neutral-50'}
                        ${dayIsToday ? 'ring-2 ring-brand-purple ring-inset' : ''}
                        hover:bg-neutral-50
                      `}
                    >
                      <div className={`text-xs font-medium p-1
                        ${dayIsToday ? 'text-brand-purple' : day.isCurrentMonth ? 'text-neutral-700' : 'text-neutral-400'}
                      `}>
                        {day.date.getDate()}
                      </div>
                      <div className="space-y-1">
                        {content.slice(0, 3).map((item, i) => (
                          <Link
                            key={i}
                            to={item.link}
                            onClick={(e) => e.stopPropagation()}
                            className={`block px-1 py-0.5 text-xs rounded border truncate ${getStatusColor(item.status)}`}
                          >
                            <span className="inline-flex items-center gap-1">
                              {getContentIcon(item.type, item.subtype)}
                              {item.title}
                            </span>
                          </Link>
                        ))}
                        {content.length > 3 && (
                          <div className="text-xs text-neutral-400 px-1">
                            +{content.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Legend */}
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <h3 className="text-sm font-medium text-neutral-900 mb-3">Legend</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-green-500 rounded-full" />
                  <span className="text-neutral-600">Published</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-blue-500 rounded-full" />
                  <span className="text-neutral-600">Scheduled</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-emerald-500 rounded-full" />
                  <span className="text-neutral-600">Approved</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-amber-500 rounded-full" />
                  <span className="text-neutral-600">Pending Review</span>
                </div>
              </div>
            </div>

            {/* Upcoming Content */}
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <h3 className="text-sm font-medium text-neutral-900 mb-3 flex items-center gap-2">
                <ClockIcon className="h-4 w-4 text-blue-500" />
                Upcoming
              </h3>
              {upcomingContent.length > 0 ? (
                <div className="space-y-2">
                  {upcomingContent.map((item, i) => (
                    <Link
                      key={i}
                      to={`/marketing/${item.type}/${item.id}`}
                      className="block p-2 bg-neutral-50 rounded-lg hover:bg-neutral-100 transition-colors"
                    >
                      <div className="flex items-center gap-2 text-xs">
                        {getContentIcon(item.type, item.post_type)}
                        <span className="text-neutral-600 truncate">
                          {item.caption?.substring(0, 25) || item.title?.substring(0, 25) || 'Untitled'}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400 mt-1">
                        {item.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-neutral-400">No upcoming scheduled content</p>
              )}
            </div>

            {/* Pending Approvals */}
            {pendingApprovals.length > 0 && (
              <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
                <h3 className="text-sm font-medium text-amber-800 mb-3 flex items-center gap-2">
                  <CheckCircleIcon className="h-4 w-4" />
                  Pending Approvals ({pendingApprovals.length})
                </h3>
                <div className="space-y-2">
                  {pendingApprovals.slice(0, 5).map((item, i) => (
                    <Link
                      key={i}
                      to={`/marketing/${item.type === 'blog' ? 'blogs' : item.type}/${item.id}`}
                      className="block p-2 bg-white rounded-lg hover:bg-amber-50 transition-colors"
                    >
                      <div className="flex items-center gap-2 text-xs">
                        {getContentIcon(item.type, item.post_type)}
                        <span className="text-neutral-700 truncate">
                          {item.caption?.substring(0, 25) || item.title?.substring(0, 25) || 'Untitled'}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Stats */}
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <h3 className="text-sm font-medium text-neutral-900 mb-3">This Month</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-2 bg-neutral-50 rounded-lg">
                  <p className="text-xl font-bold text-brand-purple">
                    {scheduledContent.blogs.filter(b => {
                      const d = new Date(b.updated_at);
                      return d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear();
                    }).length}
                  </p>
                  <p className="text-xs text-neutral-500">Blogs</p>
                </div>
                <div className="text-center p-2 bg-neutral-50 rounded-lg">
                  <p className="text-xl font-bold text-brand-pink">
                    {scheduledContent.instagram.filter(p => {
                      const d = new Date(p.scheduled_at || p.updated_at);
                      return d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear();
                    }).length}
                  </p>
                  <p className="text-xs text-neutral-500">Posts</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
