import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  RocketLaunchIcon,
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  TrophyIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ClockIcon,
  SparklesIcon,
  ArrowRightIcon,
  AcademicCapIcon,
  PlayIcon,
} from '@heroicons/react/24/outline';
import FranchiseAcademyLayout from '../../components/academy/layout/FranchiseAcademyLayout';
import AcademySidebar from '../../components/academy/layout/AcademySidebar';
import { useCompanyName } from '../../contexts/CompanyNameContext';

/**
 * AcademyDashboard - Main landing page for Franchise Academy
 *
 * Features:
 * - Welcome section with current progress overview
 * - Quick action cards for major sections
 * - Current phase progress with next recommended action
 * - Recent achievements and streak display
 * - AI Coach quick access
 */
export default function AcademyDashboard() {
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(null);
  const { isMainBranch } = useCompanyName();
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchProgress();
  }, []);

  const fetchProgress = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/academy/progress');
      if (response.ok) {
        const data = await response.json();
        setProgress(data);
      } else {
        // No progress yet - show initial state
        setProgress({
          status: 'not_started',
          current_phase: 1,
          total_points: 0,
          current_streak_days: 0,
          completion_percentage: 0,
          next_action: null,
          recent_badges: [],
        });
      }
    } catch (error) {
      console.error('Error fetching progress:', error);
      setError('Failed to load progress data');
    } finally {
      setLoading(false);
    }
  };

  // Calculate overall progress percentage
  const progressPercent = progress?.completion_percentage || 0;

  // Quick action cards data - updated colors
  const quickActions = [
    {
      title: '90-Day Journey',
      description: 'Continue your guided onboarding program',
      icon: RocketLaunchIcon,
      color: 'navy',
      to: '/academy/journey',
      stat: progress?.status === 'not_started' ? 'Get Started' : `Day ${progress?.current_day || 1} of 90`,
    },
    {
      title: 'Resource Library',
      description: 'SOPs, marketing materials, and guides',
      icon: BookOpenIcon,
      color: 'cyan',
      to: '/academy/resources',
      stat: 'Browse All',
    },
    {
      title: 'AI Coach',
      description: 'Ask Earl the Squirrel any question',
      icon: ChatBubbleLeftRightIcon,
      color: 'purple',
      to: '/academy/coach',
      stat: 'Chat Now',
      badge: 'Beta',
    },
    {
      title: 'Achievements',
      description: 'View your badges and progress',
      icon: TrophyIcon,
      color: 'green',
      to: '/academy/achievements',
      stat: `${progress?.recent_badges?.length || 0} Earned`,
    },
  ];

  const getColorClasses = (color) => {
    const colors = {
      navy: 'bg-brand-navy/5 border-brand-navy/20 hover:border-brand-navy/40 text-brand-navy',
      cyan: 'bg-brand-cyan/10 border-brand-cyan/30 hover:border-brand-cyan/50 text-cyan-600',
      purple: 'bg-brand-purple/10 border-brand-purple/30 hover:border-brand-purple/50 text-brand-purple',
      green: 'bg-brand-green/10 border-brand-green/30 hover:border-brand-green/50 text-green-600',
    };
    return colors[color] || colors.navy;
  };

  const getIconColorClasses = (color) => {
    const colors = {
      navy: 'bg-brand-navy/10 text-brand-navy',
      cyan: 'bg-brand-cyan/20 text-cyan-600',
      purple: 'bg-brand-purple/10 text-brand-purple',
      green: 'bg-brand-green/20 text-green-600',
    };
    return colors[color] || colors.navy;
  };

  if (loading) {
    return (
      <FranchiseAcademyLayout
        sidebar={<AcademySidebar isMainBranch={isMainBranch} />}
        progress={0}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-brand-navy/20 border-t-brand-navy" />
            <p className="text-neutral-500 font-medium">Loading Academy...</p>
          </div>
        </div>
      </FranchiseAcademyLayout>
    );
  }

  if (error) {
    return (
      <FranchiseAcademyLayout
        sidebar={<AcademySidebar isMainBranch={isMainBranch} />}
        progress={0}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="text-red-500 text-lg font-medium mb-2">Unable to load Academy</div>
            <p className="text-neutral-500 mb-4">{error}</p>
            <button
              onClick={fetchProgress}
              className="px-4 py-2 bg-brand-navy text-white rounded-lg hover:bg-primary-600 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </FranchiseAcademyLayout>
    );
  }

  return (
    <FranchiseAcademyLayout
      sidebar={
        <AcademySidebar
          isMainBranch={isMainBranch}
          currentPoints={progress?.total_points || 0}
          currentStreak={progress?.current_streak_days || 0}
          badgesEarned={progress?.badges_earned || 0}
        />
      }
      progress={progressPercent}
    >
      <div className="space-y-6">
        {/* Welcome Section - Navy blue gradient */}
        <div className="bg-gradient-to-r from-brand-navy via-primary-600 to-indigo-500 rounded-2xl p-6 sm:p-8 text-white shadow-lg">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">
                Welcome to Franchise Academy
              </h1>
              <p className="text-blue-100 text-sm sm:text-base max-w-xl">
                Your comprehensive training and resource center. Complete your 90-day journey to build a successful Acme Operations franchise.
              </p>
            </div>
            <div className="flex-shrink-0">
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4">
                <div className="text-center">
                  <div className="text-4xl font-bold">{progressPercent}%</div>
                  <div className="text-xs text-blue-100 mt-1">Complete</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-navy/10 rounded-lg">
                <SparklesIcon className="h-5 w-5 text-brand-navy" />
              </div>
              <div>
                <div className="text-2xl font-bold text-neutral-900">
                  {(progress?.total_points || 0).toLocaleString()}
                </div>
                <div className="text-xs text-neutral-500">Total Points</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-cyan/20 rounded-lg">
                <span className="text-lg">🔥</span>
              </div>
              <div>
                <div className="text-2xl font-bold text-neutral-900">
                  {progress?.current_streak_days || 0}
                </div>
                <div className="text-xs text-neutral-500">Day Streak</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-neutral-900">
                  {progress?.modules_completed || 0}
                </div>
                <div className="text-xs text-neutral-500">Modules Done</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-purple/10 rounded-lg">
                <TrophyIcon className="h-5 w-5 text-brand-purple" />
              </div>
              <div>
                <div className="text-2xl font-bold text-neutral-900">
                  {progress?.badges_earned || 0}
                </div>
                <div className="text-xs text-neutral-500">Badges Earned</div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions Grid */}
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.to}
                  to={action.to}
                  className={`
                    relative group rounded-xl border-2 p-5 transition-all duration-200
                    hover:shadow-md ${getColorClasses(action.color)}
                  `}
                >
                  {action.badge && (
                    <span className="absolute top-3 right-3 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-violet-100 text-violet-700">
                      {action.badge}
                    </span>
                  )}
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${getIconColorClasses(action.color)}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-neutral-900 mb-1">{action.title}</h3>
                  <p className="text-xs text-neutral-500 mb-3">{action.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{action.stat}</span>
                    <ArrowRightIcon className="h-4 w-4 text-neutral-400 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Next Action Card */}
        {progress?.next_action && (
          <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-brand-navy/10 rounded-xl">
                <PlayIcon className="h-6 w-6 text-brand-navy" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-neutral-900 mb-1">
                  Recommended Next Step
                </h3>
                <p className="text-sm text-neutral-600 mb-3">
                  {progress.next_action.title}
                </p>
                <Link
                  to={progress.next_action.link}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-navy text-white text-sm font-medium rounded-lg hover:bg-primary-600 transition-colors"
                >
                  Continue
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Get Started CTA (for new franchisees) */}
        {progress?.status === 'not_started' && (
          <div className="bg-gradient-to-br from-brand-purple to-brand-navy rounded-xl p-6 sm:p-8 text-white shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold mb-2">Ready to Begin?</h3>
                <p className="text-purple-100 text-sm">
                  Start your 90-day journey to franchise success. Our guided program will help you every step of the way.
                </p>
              </div>
              <Link
                to="/academy/journey"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-brand-purple font-semibold rounded-lg hover:bg-purple-50 transition-colors whitespace-nowrap shadow-md"
              >
                <RocketLaunchIcon className="h-5 w-5" />
                Start Journey
              </Link>
            </div>
          </div>
        )}

        {/* Recent Activity / Achievements Preview */}
        {progress?.recent_badges && progress.recent_badges.length > 0 && (
          <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-neutral-900">Recent Achievements</h3>
              <Link
                to="/academy/achievements"
                className="text-sm text-brand-navy hover:text-indigo-500 font-medium"
              >
                View All
              </Link>
            </div>
            <div className="flex flex-wrap gap-3">
              {progress.recent_badges.slice(0, 5).map((badge) => (
                <div
                  key={badge.id}
                  className="flex items-center gap-2 px-3 py-2 bg-brand-navy/5 border border-brand-navy/20 rounded-lg"
                >
                  <TrophyIcon className="h-5 w-5 text-brand-navy" />
                  <span className="text-sm font-medium text-neutral-800">{badge.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </FranchiseAcademyLayout>
  );
}
