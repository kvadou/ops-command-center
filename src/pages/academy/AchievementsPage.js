import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useCompanyName } from '../../contexts/CompanyNameContext';
import {
  TrophyIcon,
  SparklesIcon,
  FireIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';
import FranchiseAcademyLayout from '../../components/academy/layout/FranchiseAcademyLayout';
import AcademySidebar from '../../components/academy/layout/AcademySidebar';
import StreakCounter from '../../components/academy/gamification/StreakCounter';
import BadgeGrid, { RecentBadges } from '../../components/academy/gamification/BadgeGrid';
import BadgeCard from '../../components/academy/gamification/BadgeCard';
import AchievementPopup, { useAchievementQueue } from '../../components/academy/gamification/AchievementPopup';

/**
 * AchievementsPage - Display all badges, points history, and streaks
 *
 * Features:
 * - Points overview with history
 * - Streak display with milestones
 * - Badge grid with filtering
 * - Points log
 */
export default function AchievementsPage() {
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(null);
  const [badges, setBadges] = useState([]);
  const [pointsHistory, setPointsHistory] = useState([]);
  const [streakInfo, setStreakInfo] = useState(null);
  const { isMainBranch } = useCompanyName();

  const { currentBadge, isOpen, addBadges, handleClose } = useAchievementQueue();

  useEffect(() => {
    fetchData();
    logActivity();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [progressRes, badgesRes, pointsRes, streakRes] = await Promise.all([
        fetch('/api/academy/progress'),
        fetch('/api/academy/badges'),
        fetch('/api/academy/points?limit=20'),
        fetch('/api/academy/streak'),
      ]);

      if (progressRes.ok) {
        const data = await progressRes.json();
        setProgress(data);
      }

      if (badgesRes.ok) {
        const data = await badgesRes.json();
        setBadges(data);
      }

      if (pointsRes.ok) {
        const data = await pointsRes.json();
        setPointsHistory(data);
      }

      if (streakRes.ok) {
        const data = await streakRes.json();
        setStreakInfo(data);
      }
    } catch (error) {
      console.error('Error fetching achievements data:', error);
    } finally {
      setLoading(false);
    }
  };

  const logActivity = async () => {
    try {
      // Log daily activity for streak
      const activityRes = await fetch('/api/academy/activity', { method: 'POST' });
      if (activityRes.ok) {
        const data = await activityRes.json();
        if (!data.already_logged && data.points_awarded > 0) {
          // Refresh streak info
          const streakRes = await fetch('/api/academy/streak');
          if (streakRes.ok) {
            const streakData = await streakRes.json();
            setStreakInfo(streakData);
          }
        }
      }

      // Check for any new badges
      const badgesRes = await fetch('/api/academy/check-badges', { method: 'POST' });
      if (badgesRes.ok) {
        const data = await badgesRes.json();
        if (data.badges_awarded && data.badges_awarded.length > 0) {
          addBadges(data.badges_awarded);
          // Refresh badges list
          const newBadgesRes = await fetch('/api/academy/badges');
          if (newBadgesRes.ok) {
            const newBadges = await newBadgesRes.json();
            setBadges(newBadges);
          }
        }
      }
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  };

  const earnedCount = badges.filter(b => b.is_earned).length;
  const totalCount = badges.length;

  if (loading) {
    return (
      <FranchiseAcademyLayout
        sidebar={<AcademySidebar isMainBranch={isMainBranch} />}
        progress={0}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-brand-navy/20 border-t-brand-navy" />
            <p className="text-neutral-500 font-medium">Loading Achievements...</p>
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
      progress={progress?.completion_percentage || 0}
    >
      {/* Achievement Popup */}
      <AchievementPopup
        badge={currentBadge}
        isOpen={isOpen}
        onClose={handleClose}
      />

      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Achievements</h1>
          <p className="text-neutral-600 mt-1">
            Track your progress, earn badges, and build your streak
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Points */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-navy/10 rounded-lg">
                <SparklesIcon className="h-6 w-6 text-brand-navy" />
              </div>
              <div>
                <div className="text-2xl font-bold text-neutral-900">
                  {(progress?.total_points || 0).toLocaleString()}
                </div>
                <div className="text-xs text-neutral-500">Total Points</div>
              </div>
            </div>
          </div>

          {/* Badges Earned */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <TrophyIcon className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-neutral-900">
                  {earnedCount} / {totalCount}
                </div>
                <div className="text-xs text-neutral-500">Badges Earned</div>
              </div>
            </div>
          </div>

          {/* Current Streak */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-cyan/20 rounded-lg">
                <FireIcon className="h-6 w-6 text-orange-500" />
              </div>
              <div>
                <div className="text-2xl font-bold text-neutral-900">
                  {streakInfo?.current_streak_days || 0}
                </div>
                <div className="text-xs text-neutral-500">Day Streak</div>
              </div>
            </div>
          </div>

          {/* Longest Streak */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <ArrowTrendingUpIcon className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-neutral-900">
                  {streakInfo?.longest_streak_days || 0}
                </div>
                <div className="text-xs text-neutral-500">Best Streak</div>
              </div>
            </div>
          </div>
        </div>

        {/* Streak Section */}
        <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4 flex items-center gap-2">
            <FireIcon className="h-5 w-5 text-orange-500" />
            Your Streak
          </h2>
          <StreakCounter
            currentStreak={streakInfo?.current_streak_days || 0}
            longestStreak={streakInfo?.longest_streak_days || 0}
            showLongest={true}
          />
          <p className="text-sm text-neutral-500 mt-4">
            Visit the Academy every day to build your streak. Earn bonus points at 7 and 30 day milestones!
          </p>
        </div>

        {/* Badges Section */}
        <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-sm">
          <BadgeGrid
            badges={badges}
            showFilters={true}
            showCategories={true}
            size="medium"
          />
        </div>

        {/* Points History */}
        <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4 flex items-center gap-2">
            <ChartBarIcon className="h-5 w-5 text-brand-navy" />
            Recent Points Activity
          </h2>

          {pointsHistory.length === 0 ? (
            <p className="text-neutral-500 text-center py-8">
              No points activity yet. Start completing modules to earn points!
            </p>
          ) : (
            <div className="space-y-3">
              {pointsHistory.map((entry, index) => (
                <div
                  key={entry.id || index}
                  className="flex items-center justify-between py-2 border-b border-neutral-100 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className={`
                      p-1.5 rounded-lg
                      ${entry.points > 0 ? 'bg-emerald-100' : 'bg-red-100'}
                    `}>
                      <SparklesIcon className={`
                        h-4 w-4
                        ${entry.points > 0 ? 'text-emerald-600' : 'text-red-600'}
                      `} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-neutral-900">
                        {entry.reason || 'Points earned'}
                      </p>
                      <p className="text-xs text-neutral-400">
                        {new Date(entry.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  <span className={`
                    text-sm font-bold
                    ${entry.points > 0 ? 'text-emerald-600' : 'text-red-600'}
                  `}>
                    {entry.points > 0 ? '+' : ''}{entry.points} pts
                  </span>
                </div>
              ))}
            </div>
          )}

          {pointsHistory.length >= 20 && (
            <p className="text-center text-xs text-neutral-400 mt-4">
              Showing most recent 20 entries
            </p>
          )}
        </div>
      </div>
    </FranchiseAcademyLayout>
  );
}
