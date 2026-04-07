import React from 'react';
import {
  TrophyIcon,
  StarIcon,
  FireIcon,
  RocketLaunchIcon,
  SparklesIcon,
  AcademicCapIcon,
  CheckBadgeIcon,
  BoltIcon,
  HeartIcon,
  LightBulbIcon,
  LockClosedIcon,
} from '@heroicons/react/24/solid';

/**
 * BadgeCard - Individual badge display component
 *
 * Features:
 * - Earned/locked visual states
 * - Icon mapping for badge types
 * - Hover effects and animations
 * - Points reward display
 */
export default function BadgeCard({
  badge,
  isEarned = false,
  earnedAt = null,
  onClick,
  size = 'medium', // 'small', 'medium', 'large'
  showDescription = true,
  className = '',
}) {
  const {
    badge_key,
    title,
    description,
    icon,
    points_reward,
    unlock_type,
  } = badge;

  // Get icon component based on badge icon name or type
  const getIcon = () => {
    const iconMap = {
      'trophy': TrophyIcon,
      'star': StarIcon,
      'fire': FireIcon,
      'rocket': RocketLaunchIcon,
      'sparkles': SparklesIcon,
      'academic': AcademicCapIcon,
      'badge': CheckBadgeIcon,
      'bolt': BoltIcon,
      'heart': HeartIcon,
      'lightbulb': LightBulbIcon,
      // Defaults by unlock type
      'phase': TrophyIcon,
      'streak': FireIcon,
      'points': SparklesIcon,
      'special': StarIcon,
    };

    const IconComponent = iconMap[icon] || iconMap[unlock_type] || TrophyIcon;
    return IconComponent;
  };

  // Color scheme based on badge type
  const getColors = () => {
    if (!isEarned) {
      return {
        bg: 'bg-neutral-100',
        border: 'border-neutral-200',
        iconBg: 'bg-neutral-200',
        iconColor: 'text-neutral-400',
        text: 'text-neutral-400',
      };
    }

    switch (unlock_type) {
      case 'phase':
        return {
          bg: 'bg-gradient-to-br from-amber-50 to-yellow-100',
          border: 'border-amber-300',
          iconBg: 'bg-amber-400',
          iconColor: 'text-white',
          text: 'text-amber-800',
        };
      case 'streak':
        return {
          bg: 'bg-gradient-to-br from-orange-50 to-red-100',
          border: 'border-orange-300',
          iconBg: 'bg-gradient-to-br from-orange-400 to-red-500',
          iconColor: 'text-white',
          text: 'text-orange-800',
        };
      case 'points':
        return {
          bg: 'bg-gradient-to-br from-violet-50 to-purple-100',
          border: 'border-violet-300',
          iconBg: 'bg-gradient-to-br from-violet-400 to-purple-500',
          iconColor: 'text-white',
          text: 'text-violet-800',
        };
      case 'special':
        return {
          bg: 'bg-gradient-to-br from-cyan-50 to-blue-100',
          border: 'border-cyan-300',
          iconBg: 'bg-gradient-to-br from-cyan-400 to-blue-500',
          iconColor: 'text-white',
          text: 'text-cyan-800',
        };
      default:
        return {
          bg: 'bg-gradient-to-br from-brand-navy/5 to-indigo-500/10',
          border: 'border-brand-navy/30',
          iconBg: 'bg-brand-navy',
          iconColor: 'text-white',
          text: 'text-brand-navy',
        };
    }
  };

  const sizeClasses = {
    small: {
      wrapper: 'p-3',
      iconWrapper: 'w-10 h-10',
      icon: 'h-5 w-5',
      title: 'text-xs',
      description: 'text-[10px]',
    },
    medium: {
      wrapper: 'p-4',
      iconWrapper: 'w-14 h-14',
      icon: 'h-7 w-7',
      title: 'text-sm',
      description: 'text-xs',
    },
    large: {
      wrapper: 'p-6',
      iconWrapper: 'w-20 h-20',
      icon: 'h-10 w-10',
      title: 'text-base',
      description: 'text-sm',
    },
  };

  const Icon = getIcon();
  const colors = getColors();
  const sizes = sizeClasses[size];

  return (
    <div
      onClick={onClick}
      className={`
        relative rounded-xl border-2 ${sizes.wrapper}
        ${colors.bg} ${colors.border}
        ${onClick ? 'cursor-pointer hover:scale-105 hover:shadow-lg' : ''}
        transition-all duration-300
        ${!isEarned ? 'grayscale' : ''}
        ${className}
      `}
    >
      {/* Lock overlay for unearned badges */}
      {!isEarned && (
        <div className="absolute top-2 right-2">
          <LockClosedIcon className="h-4 w-4 text-neutral-300" />
        </div>
      )}

      <div className="flex flex-col items-center text-center">
        {/* Badge icon */}
        <div className={`
          ${sizes.iconWrapper} rounded-full flex items-center justify-center
          ${colors.iconBg} shadow-md mb-3
          ${isEarned ? 'ring-2 ring-white ring-offset-2' : ''}
        `}>
          <Icon className={`${sizes.icon} ${colors.iconColor}`} />
        </div>

        {/* Badge title */}
        <h4 className={`font-bold ${sizes.title} ${colors.text} mb-1`}>
          {title}
        </h4>

        {/* Description */}
        {showDescription && description && (
          <p className={`${sizes.description} text-neutral-500 line-clamp-2 mb-2`}>
            {description}
          </p>
        )}

        {/* Points reward */}
        {points_reward > 0 && (
          <div className={`
            flex items-center gap-1 px-2 py-0.5 rounded-full
            ${isEarned ? 'bg-white/60' : 'bg-neutral-200'}
          `}>
            <SparklesIcon className="h-3 w-3 text-amber-500" />
            <span className="text-[10px] font-medium text-neutral-600">
              +{points_reward} pts
            </span>
          </div>
        )}

        {/* Earned date */}
        {isEarned && earnedAt && (
          <p className="text-[10px] text-neutral-400 mt-2">
            Earned {new Date(earnedAt).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Shine effect for earned badges */}
      {isEarned && (
        <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer" />
        </div>
      )}
    </div>
  );
}

/**
 * MiniBadge - Ultra compact badge display for inline use
 */
export function MiniBadge({ badge, isEarned = false, className = '' }) {
  const Icon = badge.icon ? {
    'trophy': TrophyIcon,
    'star': StarIcon,
    'fire': FireIcon,
    'rocket': RocketLaunchIcon,
    'sparkles': SparklesIcon,
  }[badge.icon] || TrophyIcon : TrophyIcon;

  return (
    <div
      className={`
        inline-flex items-center gap-1.5 px-2 py-1 rounded-full
        ${isEarned
          ? 'bg-amber-100 border border-amber-200'
          : 'bg-neutral-100 border border-neutral-200 grayscale'
        }
        ${className}
      `}
      title={badge.title}
    >
      <Icon className={`h-3 w-3 ${isEarned ? 'text-amber-600' : 'text-neutral-400'}`} />
      <span className={`text-xs font-medium ${isEarned ? 'text-amber-800' : 'text-neutral-500'}`}>
        {badge.title}
      </span>
    </div>
  );
}
