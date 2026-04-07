import React, { useState, useEffect } from 'react';
import { FireIcon, SparklesIcon } from '@heroicons/react/24/solid';

/**
 * StreakCounter - Displays current streak with visual feedback
 *
 * Features:
 * - Animated flame icon when active
 * - Shows current and longest streak
 * - Visual feedback on streak increase
 * - Compact and full display modes
 */
export default function StreakCounter({
  currentStreak = 0,
  longestStreak = 0,
  compact = false,
  showLongest = true,
  onStreakClick,
  className = '',
}) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [prevStreak, setPrevStreak] = useState(currentStreak);

  useEffect(() => {
    if (currentStreak > prevStreak) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 1000);
      return () => clearTimeout(timer);
    }
    setPrevStreak(currentStreak);
  }, [currentStreak, prevStreak]);

  const getStreakColor = () => {
    if (currentStreak >= 30) return 'text-violet-500';
    if (currentStreak >= 14) return 'text-amber-500';
    if (currentStreak >= 7) return 'text-orange-500';
    if (currentStreak >= 3) return 'text-red-500';
    return 'text-neutral-400';
  };

  const getStreakBgColor = () => {
    if (currentStreak >= 30) return 'bg-violet-100';
    if (currentStreak >= 14) return 'bg-amber-100';
    if (currentStreak >= 7) return 'bg-orange-100';
    if (currentStreak >= 3) return 'bg-red-100';
    return 'bg-neutral-100';
  };

  const getStreakMessage = () => {
    if (currentStreak >= 30) return 'Legendary! 🏆';
    if (currentStreak >= 14) return 'On Fire! 🔥';
    if (currentStreak >= 7) return 'Week Warrior! 💪';
    if (currentStreak >= 3) return 'Getting Started! ⭐';
    if (currentStreak >= 1) return 'Keep it up!';
    return 'Start your streak!';
  };

  if (compact) {
    return (
      <button
        onClick={onStreakClick}
        className={`
          flex items-center gap-1.5 px-2.5 py-1 rounded-full
          ${getStreakBgColor()} transition-all duration-300
          ${isAnimating ? 'scale-110' : ''}
          ${onStreakClick ? 'hover:scale-105 cursor-pointer' : ''}
          ${className}
        `}
      >
        <FireIcon className={`h-4 w-4 ${getStreakColor()} ${isAnimating ? 'animate-bounce' : ''}`} />
        <span className={`text-sm font-bold ${getStreakColor()}`}>
          {currentStreak}
        </span>
      </button>
    );
  }

  return (
    <div
      className={`
        rounded-xl border border-neutral-200 bg-white p-4 shadow-sm
        ${onStreakClick ? 'hover:shadow-md cursor-pointer transition-shadow' : ''}
        ${className}
      `}
      onClick={onStreakClick}
    >
      <div className="flex items-center gap-4">
        {/* Fire icon with animation */}
        <div className={`
          relative p-3 rounded-xl ${getStreakBgColor()}
          ${isAnimating ? 'animate-pulse' : ''}
        `}>
          <FireIcon className={`h-8 w-8 ${getStreakColor()}`} />
          {currentStreak > 0 && isAnimating && (
            <SparklesIcon className="absolute -top-1 -right-1 h-4 w-4 text-amber-400 animate-ping" />
          )}
        </div>

        {/* Streak info */}
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-neutral-900">{currentStreak}</span>
            <span className="text-sm text-neutral-500">day{currentStreak !== 1 ? 's' : ''}</span>
          </div>
          <p className="text-sm font-medium text-neutral-600">
            {getStreakMessage()}
          </p>
          {showLongest && longestStreak > currentStreak && (
            <p className="text-xs text-neutral-400 mt-1">
              Best: {longestStreak} days
            </p>
          )}
        </div>
      </div>

      {/* Streak milestone indicators */}
      {currentStreak > 0 && (
        <div className="mt-4 flex gap-1">
          {[3, 7, 14, 30].map((milestone) => (
            <div
              key={milestone}
              className={`
                flex-1 h-1.5 rounded-full transition-colors duration-300
                ${currentStreak >= milestone
                  ? milestone === 30
                    ? 'bg-violet-500'
                    : milestone === 14
                    ? 'bg-amber-500'
                    : milestone === 7
                    ? 'bg-orange-500'
                    : 'bg-red-400'
                  : 'bg-neutral-200'
                }
              `}
              title={`${milestone}-day milestone`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * MiniStreak - Ultra compact streak display for headers
 */
export function MiniStreak({ currentStreak = 0, className = '' }) {
  if (currentStreak === 0) return null;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <span className="text-sm">🔥</span>
      <span className="text-xs font-bold text-brand-navy">{currentStreak}</span>
    </div>
  );
}
