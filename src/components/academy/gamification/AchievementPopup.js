import React, { useState, useEffect, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import {
  TrophyIcon,
  StarIcon,
  FireIcon,
  SparklesIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import ConfettiCelebration from './ConfettiCelebration';

/**
 * AchievementPopup - Celebration modal when a badge is earned
 *
 * Features:
 * - Animated entrance
 * - Confetti effect
 * - Badge display with glow
 * - Points awarded display
 * - Auto-dismiss option
 */
export default function AchievementPopup({
  badge,
  isOpen = false,
  onClose,
  autoDismiss = 5000, // ms, 0 to disable
  showConfetti = true,
}) {
  const [showConfettiEffect, setShowConfettiEffect] = useState(false);

  useEffect(() => {
    if (isOpen && showConfetti) {
      setShowConfettiEffect(true);
      const timer = setTimeout(() => setShowConfettiEffect(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, showConfetti]);

  useEffect(() => {
    if (isOpen && autoDismiss > 0) {
      const timer = setTimeout(() => {
        onClose?.();
      }, autoDismiss);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoDismiss, onClose]);

  if (!badge) return null;

  const getIcon = () => {
    const iconMap = {
      phase: TrophyIcon,
      streak: FireIcon,
      points: SparklesIcon,
      special: StarIcon,
    };
    return iconMap[badge.unlock_type] || TrophyIcon;
  };

  const Icon = getIcon();

  return (
    <>
      {showConfettiEffect && <ConfettiCelebration />}

      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={onClose || (() => {})}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-50 rotate-12"
                enterTo="opacity-100 scale-100 rotate-0"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-sm transform overflow-hidden rounded-2xl bg-white p-6 text-center shadow-xl transition-all">
                  {/* Close button */}
                  {onClose && (
                    <button
                      onClick={onClose}
                      className="absolute top-3 right-3 p-1 rounded-full hover:bg-neutral-100 transition-colors"
                    >
                      <XMarkIcon className="h-5 w-5 text-neutral-400" />
                    </button>
                  )}

                  {/* Achievement unlocked header */}
                  <div className="mb-6">
                    <p className="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-1">
                      🎉 Achievement Unlocked!
                    </p>
                  </div>

                  {/* Badge icon with glow effect */}
                  <div className="relative inline-block mb-6">
                    <div className="absolute inset-0 bg-amber-400/30 rounded-full blur-xl animate-pulse" />
                    <div className="relative w-24 h-24 mx-auto bg-gradient-to-br from-amber-400 to-yellow-500 rounded-full flex items-center justify-center shadow-lg ring-4 ring-white">
                      <Icon className="h-12 w-12 text-white drop-shadow-lg" />
                    </div>
                    {/* Shine effect */}
                    <div className="absolute inset-0 rounded-full overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full animate-shimmer" />
                    </div>
                  </div>

                  {/* Badge info */}
                  <Dialog.Title
                    as="h3"
                    className="text-xl font-bold text-neutral-900 mb-2"
                  >
                    {badge.title}
                  </Dialog.Title>

                  {badge.description && (
                    <p className="text-sm text-neutral-600 mb-4">
                      {badge.description}
                    </p>
                  )}

                  {/* Points reward */}
                  {badge.points_reward > 0 && (
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-100 to-yellow-100 rounded-full mb-6">
                      <SparklesIcon className="h-5 w-5 text-amber-600" />
                      <span className="text-lg font-bold text-amber-800">
                        +{badge.points_reward} Points
                      </span>
                    </div>
                  )}

                  {/* Action button */}
                  <button
                    onClick={onClose}
                    className="w-full px-6 py-3 bg-brand-navy text-white font-semibold rounded-xl hover:bg-primary-600 transition-colors shadow-md"
                  >
                    Awesome!
                  </button>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
}

/**
 * useAchievementQueue - Hook to manage a queue of achievements to show
 */
export function useAchievementQueue() {
  const [queue, setQueue] = useState([]);
  const [currentBadge, setCurrentBadge] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen && queue.length > 0) {
      const [next, ...rest] = queue;
      setCurrentBadge(next);
      setQueue(rest);
      setIsOpen(true);
    }
  }, [isOpen, queue]);

  const addBadge = (badge) => {
    setQueue(prev => [...prev, badge]);
  };

  const addBadges = (badges) => {
    setQueue(prev => [...prev, ...badges]);
  };

  const handleClose = () => {
    setIsOpen(false);
    setCurrentBadge(null);
  };

  return {
    currentBadge,
    isOpen,
    addBadge,
    addBadges,
    handleClose,
    queueLength: queue.length,
  };
}
