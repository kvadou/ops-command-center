import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import CommandCenterDashboard from '../../components/marketing/CommandCenterDashboard';
import {
  ChatBubbleLeftRightIcon,
  ChartBarIcon,
  MegaphoneIcon,
  DocumentTextIcon,
  PhotoIcon,
  CalendarDaysIcon,
  BeakerIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

/**
 * MarketingDashboard - Main dashboard for Marketing Hub
 *
 * Shows:
 * - Quick actions grid
 * - Create new content actions
 * - Pending approvals widget
 * - Recent activity
 * - Key metrics at a glance
 */
export default function MarketingDashboard() {
  const [stats, setStats] = useState({
    pendingActions: 0,
    scheduledPosts: 0,
    activeCampaigns: 0,
    abTests: 0,
    pendingBlogs: 0,
    pendingInstagram: 0,
    loading: true,
  });

  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [activeTab, setActiveTab] = useState('command-center');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Load all data in parallel
      const [actionsRes, liveCampaignsRes, abRes, blogsRes, instagramRes] = await Promise.all([
        fetch('/api/marketing-command-center/pending-actions'),
        fetch('/api/marketing-command-center/live-campaigns'),
        fetch('/api/marketing-command-center/ab-tests'),
        fetch('/api/marketing-command-center/blogs'),
        fetch('/api/marketing-command-center/instagram'),
      ]);

      // Parse responses
      const actions = actionsRes.ok ? await actionsRes.json() : [];
      const liveCampaigns = liveCampaignsRes.ok ? await liveCampaignsRes.json() : { combined: { active: 0 } };
      const tests = abRes.ok ? await abRes.json() : [];
      const blogs = blogsRes.ok ? await blogsRes.json() : [];
      const instagram = instagramRes.ok ? await instagramRes.json() : [];

      // Calculate stats
      const pendingBlogs = blogs.filter(b => b.status === 'pending_review');
      const pendingInstagram = instagram.filter(p => p.status === 'pending_review');
      const scheduledPosts = instagram.filter(p => p.status === 'scheduled').length;

      // Use live campaign counts from actual ad platforms (Meta + Google + Klaviyo)
      setStats({
        pendingActions: actions.length,
        scheduledPosts,
        activeCampaigns: liveCampaigns.combined?.active || 0,
        liveCampaignDetails: liveCampaigns, // Store full details for drilldown
        abTests: tests.filter(t => t.status === 'active').length,
        pendingBlogs: pendingBlogs.length,
        pendingInstagram: pendingInstagram.length,
        loading: false,
      });

      // Build pending approvals list
      const approvals = [
        ...pendingBlogs.map(b => ({
          id: b.id,
          type: 'blog',
          title: b.title || 'Untitled Blog',
          link: `/marketing/blogs/${b.id}`,
          time: new Date(b.updated_at).toLocaleDateString(),
        })),
        ...pendingInstagram.map(p => ({
          id: p.id,
          type: 'instagram',
          title: p.caption?.substring(0, 40) || `${p.post_type} Post`,
          link: `/marketing/instagram/${p.id}`,
          time: new Date(p.updated_at).toLocaleDateString(),
        })),
      ].slice(0, 5);

      setPendingApprovals(approvals);

      // Build recent activity
      const activity = [];
      blogs.slice(0, 2).forEach(b => {
        activity.push({
          id: `blog-${b.id}`,
          type: 'blog',
          message: `Blog "${b.title?.substring(0, 30) || 'Untitled'}..." ${b.status === 'published' ? 'published' : 'updated'}`,
          time: getRelativeTime(new Date(b.updated_at)),
        });
      });
      instagram.slice(0, 2).forEach(p => {
        activity.push({
          id: `ig-${p.id}`,
          type: 'instagram',
          message: `Instagram ${p.post_type} ${p.status === 'published' ? 'published' : p.status === 'scheduled' ? 'scheduled' : 'updated'}`,
          time: getRelativeTime(new Date(p.updated_at)),
        });
      });

      setRecentActivity(activity.slice(0, 4));
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setStats(prev => ({ ...prev, loading: false }));
    }
  };

  const getRelativeTime = (date) => {
    const now = new Date();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 60) return `${mins} min ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
  };

  const totalPendingApprovals = stats.pendingBlogs + stats.pendingInstagram;

  const quickActions = [
    {
      name: 'AI Advisor',
      description: 'Get AI-powered marketing recommendations',
      icon: ChatBubbleLeftRightIcon,
      to: '/marketing/advisor',
      color: 'bg-violet-500',
      badge: stats.pendingActions > 0 ? `${stats.pendingActions} pending` : null,
    },
    {
      name: 'Analytics',
      description: 'View campaign performance metrics',
      icon: ChartBarIcon,
      to: '/marketing/analytics',
      color: 'bg-blue-500',
    },
    {
      name: 'Campaigns',
      description: 'Manage Meta & Google campaigns',
      icon: MegaphoneIcon,
      to: '/marketing/campaigns',
      color: 'bg-pink-500',
      badge: stats.activeCampaigns > 0 ? `${stats.activeCampaigns} active` : null,
    },
    {
      name: 'A/B Tests',
      description: 'Run and analyze marketing experiments',
      icon: BeakerIcon,
      to: '/marketing/ab-tests',
      color: 'bg-amber-500',
      badge: stats.abTests > 0 ? `${stats.abTests} running` : null,
    },
    {
      name: 'Blog Drafts',
      description: 'Create AI-powered blog content',
      icon: DocumentTextIcon,
      to: '/marketing/blogs',
      color: 'bg-emerald-500',
      badge: stats.pendingBlogs > 0 ? `${stats.pendingBlogs} pending` : null,
    },
    {
      name: 'Instagram',
      description: 'Manage Instagram posts & stories',
      icon: PhotoIcon,
      to: '/marketing/instagram',
      color: 'bg-rose-500',
      badge: stats.scheduledPosts > 0 ? `${stats.scheduledPosts} scheduled` : null,
    },
  ];

  // Build campaign breakdown tooltip
  const campaignBreakdown = stats.liveCampaignDetails ? [
    stats.liveCampaignDetails.google?.active > 0 && `Google: ${stats.liveCampaignDetails.google.active}`,
    stats.liveCampaignDetails.meta?.active > 0 && `Meta: ${stats.liveCampaignDetails.meta.active}`,
    stats.liveCampaignDetails.klaviyo?.active > 0 && `Klaviyo: ${stats.liveCampaignDetails.klaviyo.active}`,
  ].filter(Boolean).join(', ') : '';

  const statCards = [
    {
      label: 'Pending Approvals',
      value: totalPendingApprovals,
      icon: ClockIcon,
      color: totalPendingApprovals > 0 ? 'text-amber-600' : 'text-green-600',
      bgColor: totalPendingApprovals > 0 ? 'bg-amber-50' : 'bg-green-50',
    },
    {
      label: 'Active Campaigns',
      value: stats.activeCampaigns,
      icon: MegaphoneIcon,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      subtitle: campaignBreakdown || 'Live campaigns from Meta, Google, Klaviyo',
    },
    {
      label: 'Running A/B Tests',
      value: stats.abTests,
      icon: BeakerIcon,
      color: 'text-violet-600',
      bgColor: 'bg-violet-50',
    },
    {
      label: 'Scheduled Posts',
      value: stats.scheduledPosts,
      icon: CalendarDaysIcon,
      color: 'text-pink-600',
      bgColor: 'bg-pink-50',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Welcome Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Marketing Hub</h1>
            <p className="mt-1 text-sm text-neutral-500">
              AI-powered marketing management for Acme Operations
            </p>
          </div>
          <Link
            to="/marketing/advisor"
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors shadow-md"
          >
            <ChatBubbleLeftRightIcon className="h-5 w-5" />
            Chat with AI Advisor
          </Link>
        </div>

        {/* View Tabs */}
        <div className="flex border-b border-neutral-200">
          <button
            onClick={() => setActiveTab('command-center')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'command-center'
                ? 'border-brand-purple text-brand-purple'
                : 'border-transparent text-neutral-500 hover:text-neutral-700'
            }`}
          >
            Command Center
          </button>
          <button
            onClick={() => setActiveTab('classic')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'classic'
                ? 'border-brand-purple text-brand-purple'
                : 'border-transparent text-neutral-500 hover:text-neutral-700'
            }`}
          >
            Classic View
          </button>
        </div>

        {/* Command Center Tab */}
        {activeTab === 'command-center' && (
          <CommandCenterDashboard />
        )}

        {/* Classic View Tab */}
        {activeTab === 'classic' && (
        <>
        {/* Create New Content */}
        <div className="bg-brand-purple/5 rounded-xl border border-brand-purple/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <SparklesIcon className="h-5 w-5 text-brand-purple" />
            <h2 className="text-sm font-semibold text-neutral-900">Create New Content</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/marketing/campaigns/create"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-neutral-200 text-neutral-700 text-sm font-medium rounded-lg hover:border-brand-purple hover:text-brand-purple transition-colors"
            >
              <PlusIcon className="h-4 w-4" />
              Campaign
            </Link>
            <Link
              to="/marketing/blogs"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-neutral-200 text-neutral-700 text-sm font-medium rounded-lg hover:border-brand-purple hover:text-brand-purple transition-colors"
            >
              <PlusIcon className="h-4 w-4" />
              Blog Post
            </Link>
            <Link
              to="/marketing/instagram"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-neutral-200 text-neutral-700 text-sm font-medium rounded-lg hover:border-brand-pink hover:text-brand-pink transition-colors"
            >
              <PlusIcon className="h-4 w-4" />
              Instagram Post
            </Link>
            <Link
              to="/marketing/content"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-neutral-200 text-neutral-700 text-sm font-medium rounded-lg hover:border-neutral-400 hover:text-neutral-600 transition-colors"
            >
              <CalendarDaysIcon className="h-4 w-4" />
              Content Calendar
            </Link>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className={`${stat.bgColor} rounded-xl p-4 border border-neutral-100`}
              title={stat.subtitle || ''}
            >
              <div className="flex items-center gap-3">
                <stat.icon className={`h-8 w-8 ${stat.color}`} />
                <div>
                  <p className="text-2xl font-bold text-neutral-900">
                    {stats.loading ? '-' : stat.value}
                  </p>
                  <p className="text-xs text-neutral-500">{stat.label}</p>
                  {stat.subtitle && !stats.loading && (
                    <p className="text-[10px] text-neutral-400 mt-0.5 truncate max-w-[120px]">{stat.subtitle}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions Grid */}
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {quickActions.map((action) => (
              <Link
                key={action.name}
                to={action.to}
                className="group relative bg-white rounded-xl border border-neutral-200 p-5 hover:border-brand-purple/30 hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-start gap-4">
                  <div className={`${action.color} p-3 rounded-lg`}>
                    <action.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-neutral-900 group-hover:text-brand-purple transition-colors">
                      {action.name}
                    </h3>
                    <p className="mt-1 text-xs text-neutral-500 line-clamp-2">
                      {action.description}
                    </p>
                  </div>
                </div>
                {action.badge && (
                  <span className="absolute top-3 right-3 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-brand-purple/10 text-brand-purple">
                    {action.badge}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>

        {/* Bottom Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Pending Approvals */}
          {pendingApprovals.length > 0 && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-amber-800 flex items-center gap-2">
                  <CheckCircleIcon className="h-5 w-5" />
                  Pending Approvals
                </h2>
                <span className="px-2 py-0.5 text-xs font-medium bg-amber-200 text-amber-800 rounded-full">
                  {totalPendingApprovals}
                </span>
              </div>
              <div className="space-y-3">
                {pendingApprovals.map((item) => (
                  <Link
                    key={`${item.type}-${item.id}`}
                    to={item.link}
                    className="block p-3 bg-white rounded-lg hover:bg-amber-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {item.type === 'blog' ? (
                        <DocumentTextIcon className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <PhotoIcon className="h-4 w-4 text-rose-500" />
                      )}
                      <span className="text-sm text-neutral-700 truncate">{item.title}</span>
                    </div>
                    <p className="text-xs text-neutral-400 mt-1">{item.time}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Activity Feed */}
          <div className={`bg-white rounded-xl border border-neutral-200 p-5 ${pendingApprovals.length > 0 ? '' : 'lg:col-span-2'}`}>
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">Recent Activity</h2>
            <div className="space-y-4">
              {recentActivity.length > 0 ? (
                recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className={`mt-0.5 p-1.5 rounded-full ${
                      activity.type === 'blog' ? 'bg-emerald-100' :
                      activity.type === 'instagram' ? 'bg-rose-100' :
                      activity.type === 'ai_recommendation' ? 'bg-violet-100' :
                      'bg-blue-100'
                    }`}>
                      {activity.type === 'blog' ? (
                        <DocumentTextIcon className="h-4 w-4 text-emerald-600" />
                      ) : activity.type === 'instagram' ? (
                        <PhotoIcon className="h-4 w-4 text-rose-600" />
                      ) : activity.type === 'ai_recommendation' ? (
                        <ChatBubbleLeftRightIcon className="h-4 w-4 text-violet-600" />
                      ) : (
                        <MegaphoneIcon className="h-4 w-4 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-neutral-700">{activity.message}</p>
                      <p className="text-xs text-neutral-400 mt-0.5">{activity.time}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-neutral-500 text-center py-4">No recent activity</p>
              )}
            </div>
          </div>

          {/* AI Insights Preview */}
          <div className="bg-brand-purple/5 rounded-xl border border-brand-purple/20 p-5">
            <div className="flex items-center gap-2 mb-4">
              <ChatBubbleLeftRightIcon className="h-5 w-5 text-brand-purple" />
              <h2 className="text-lg font-semibold text-neutral-900">AI Insights</h2>
            </div>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-white/60 rounded-lg">
                <ArrowTrendingUpIcon className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-neutral-700">Performance Tip</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Your Google Ads conversion rate improved 12% this week. Consider increasing budget on top performers.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white/60 rounded-lg">
                <ExclamationTriangleIcon className="h-5 w-5 text-amber-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-neutral-700">Attention Needed</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Meta ad frequency is high on "Winter Camp" campaign. Consider refreshing creative.
                  </p>
                </div>
              </div>
              <Link
                to="/marketing/advisor"
                className="block text-center text-sm font-medium text-brand-purple hover:text-brand-pink transition-colors mt-4"
              >
                Get more insights from AI Advisor
              </Link>
            </div>
          </div>
        </div>
        </>
        )}
      </div>
  );
}
