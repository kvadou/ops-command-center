import React, { useState } from 'react';
import BadgeCard from './BadgeCard';
import { TrophyIcon, LockClosedIcon, FunnelIcon } from '@heroicons/react/24/outline';

/**
 * BadgeGrid - Displays a collection of badges in a responsive grid
 *
 * Features:
 * - Filter by type (all, earned, locked)
 * - Group by category
 * - Responsive grid layout
 * - Empty states for each filter
 */
export default function BadgeGrid({
  badges = [],
  onBadgeClick,
  showFilters = true,
  showCategories = true,
  columns = 'auto', // 'auto', 2, 3, 4
  size = 'medium',
  className = '',
}) {
  const [filter, setFilter] = useState('all'); // 'all', 'earned', 'locked'

  // Filter badges
  const filteredBadges = badges.filter(badge => {
    if (filter === 'earned') return badge.is_earned;
    if (filter === 'locked') return !badge.is_earned;
    return true;
  });

  // Group by unlock_type if showCategories is true
  const groupedBadges = showCategories
    ? filteredBadges.reduce((acc, badge) => {
        const type = badge.unlock_type || 'other';
        if (!acc[type]) acc[type] = [];
        acc[type].push(badge);
        return acc;
      }, {})
    : { all: filteredBadges };

  const getCategoryTitle = (type) => {
    const titles = {
      phase: '🏆 Phase Completion',
      streak: '🔥 Streak Milestones',
      points: '⭐ Points Milestones',
      special: '✨ Special Achievements',
      other: '🎯 Other',
    };
    return titles[type] || type;
  };

  const getGridCols = () => {
    if (columns === 'auto') {
      return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';
    }
    return {
      2: 'grid-cols-2',
      3: 'grid-cols-2 sm:grid-cols-3',
      4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
    }[columns] || 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';
  };

  const earnedCount = badges.filter(b => b.is_earned).length;
  const totalCount = badges.length;

  return (
    <div className={className}>
      {/* Header with filters */}
      {showFilters && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <TrophyIcon className="h-5 w-5 text-amber-500" />
              <span className="text-lg font-semibold text-neutral-900">
                {earnedCount} of {totalCount} Badges
              </span>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg">
            {[
              { key: 'all', label: 'All' },
              { key: 'earned', label: 'Earned' },
              { key: 'locked', label: 'Locked' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`
                  px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                  ${filter === key
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                  }
                `}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Badge grid */}
      {filteredBadges.length === 0 ? (
        <div className="text-center py-12 bg-neutral-50 rounded-xl border border-neutral-200">
          {filter === 'earned' ? (
            <>
              <TrophyIcon className="h-12 w-12 mx-auto text-neutral-300 mb-3" />
              <p className="text-neutral-500 font-medium">No badges earned yet</p>
              <p className="text-sm text-neutral-400 mt-1">
                Keep completing modules to earn your first badge!
              </p>
            </>
          ) : filter === 'locked' ? (
            <>
              <LockClosedIcon className="h-12 w-12 mx-auto text-neutral-300 mb-3" />
              <p className="text-neutral-500 font-medium">All badges unlocked!</p>
              <p className="text-sm text-neutral-400 mt-1">
                You've earned every badge. Congratulations!
              </p>
            </>
          ) : (
            <>
              <TrophyIcon className="h-12 w-12 mx-auto text-neutral-300 mb-3" />
              <p className="text-neutral-500 font-medium">No badges available</p>
            </>
          )}
        </div>
      ) : showCategories ? (
        // Grouped by category
        <div className="space-y-8">
          {Object.entries(groupedBadges).map(([type, categoryBadges]) => (
            categoryBadges.length > 0 && (
              <div key={type}>
                <h3 className="text-sm font-semibold text-neutral-700 mb-4">
                  {getCategoryTitle(type)}
                </h3>
                <div className={`grid ${getGridCols()} gap-4`}>
                  {categoryBadges.map(badge => (
                    <BadgeCard
                      key={badge.id || badge.badge_key}
                      badge={badge}
                      isEarned={badge.is_earned}
                      earnedAt={badge.earned_at}
                      onClick={onBadgeClick ? () => onBadgeClick(badge) : undefined}
                      size={size}
                    />
                  ))}
                </div>
              </div>
            )
          ))}
        </div>
      ) : (
        // Flat grid
        <div className={`grid ${getGridCols()} gap-4`}>
          {filteredBadges.map(badge => (
            <BadgeCard
              key={badge.id || badge.badge_key}
              badge={badge}
              isEarned={badge.is_earned}
              earnedAt={badge.earned_at}
              onClick={onBadgeClick ? () => onBadgeClick(badge) : undefined}
              size={size}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * RecentBadges - Horizontal scroll of recently earned badges
 */
export function RecentBadges({ badges = [], limit = 5, className = '' }) {
  const recentEarned = badges
    .filter(b => b.is_earned && b.earned_at)
    .sort((a, b) => new Date(b.earned_at) - new Date(a.earned_at))
    .slice(0, limit);

  if (recentEarned.length === 0) return null;

  return (
    <div className={className}>
      <h4 className="text-sm font-semibold text-neutral-700 mb-3">Recent Achievements</h4>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {recentEarned.map(badge => (
          <BadgeCard
            key={badge.id || badge.badge_key}
            badge={badge}
            isEarned={true}
            earnedAt={badge.earned_at}
            size="small"
            showDescription={false}
            className="flex-shrink-0"
          />
        ))}
      </div>
    </div>
  );
}
