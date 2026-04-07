import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  HomeIcon,
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  TrophyIcon,
  ChartBarIcon,
  FolderIcon,
  Cog6ToothIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  RocketLaunchIcon,
  SparklesIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';
import Tooltip from '@mui/material/Tooltip';

/**
 * AcademySidebar - Collapsible sidebar for the Franchise Academy
 *
 * Features:
 * - Journey section (dashboard, phases)
 * - Resources section
 * - AI Coach access
 * - Progress & achievements
 * - Admin section (main branch only)
 * - Blue color scheme matching header
 */
export default function AcademySidebar({
  isMainBranch = false,
  currentPoints = 0,
  currentStreak = 0,
  badgesEarned = 0,
  isMobile = false
}) {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (isMobile) return false;
    const saved = localStorage.getItem('academySidebarCollapsed');
    return saved === 'true';
  });

  useEffect(() => {
    if (!isMobile) {
      localStorage.setItem('academySidebarCollapsed', isCollapsed.toString());
    }
  }, [isCollapsed, isMobile]);

  const isActive = (path) => {
    if (path === '/academy') {
      return location.pathname === '/academy';
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const renderNavItem = (item) => {
    const Icon = item.icon;
    const active = isActive(item.to);

    const linkContent = (
      <Link
        to={item.to}
        className={`
          group relative flex items-center gap-3 px-4 py-2.5
          rounded-lg text-sm transition-all duration-200
          ${active
            ? "bg-brand-navy/10 text-brand-navy font-semibold"
            : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          }
        `}
      >
        {/* Accent bar for active items */}
        {active && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 h-3/5 w-1 bg-brand-navy rounded-r-full" />
        )}
        <Icon className={`h-5 w-5 flex-shrink-0 transition-colors duration-200 ${
          active ? "text-brand-navy" : "text-neutral-400 group-hover:text-neutral-600"
        }`} />
        {(!isCollapsed || isMobile) && (
          <>
            <span className="flex-1 truncate">
              {item.label}
            </span>
            {item.badge && (
              <span className={`ml-auto px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase tracking-wide flex-shrink-0 ${
                item.badgeColor || 'bg-brand-navy/10 text-brand-navy'
              }`}>
                {item.badge}
              </span>
            )}
          </>
        )}
      </Link>
    );

    if (isCollapsed && !isMobile) {
      return (
        <Tooltip key={item.to} title={item.label} placement="right" arrow>
          {linkContent}
        </Tooltip>
      );
    }

    return <div key={item.to}>{linkContent}</div>;
  };

  const renderSectionHeader = (label, icon) => {
    const Icon = icon;
    if (isCollapsed && !isMobile) {
      return (
        <Tooltip title={label} placement="right" arrow>
          <div className="flex items-center justify-center py-2 mt-4 border-t border-neutral-100">
            <Icon className="h-4 w-4 text-neutral-400" />
          </div>
        </Tooltip>
      );
    }
    return (
      <div className="flex items-center gap-2 px-4 py-2 mt-4 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider border-t border-neutral-100 first:border-t-0 first:mt-0">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
    );
  };

  // Navigation items
  const journeyItems = [
    { to: '/academy', label: 'Dashboard', icon: HomeIcon },
    { to: '/academy/journey', label: '90-Day Journey', icon: RocketLaunchIcon, badge: 'Active', badgeColor: 'bg-emerald-100 text-emerald-700' },
  ];

  const learningItems = [
    { to: '/academy/resources', label: 'Resource Library', icon: FolderIcon },
    { to: '/academy/coach', label: 'AI Coach', icon: ChatBubbleLeftRightIcon, badge: 'Beta', badgeColor: 'bg-violet-100 text-violet-700' },
  ];

  const progressItems = [
    { to: '/academy/achievements', label: 'Achievements', icon: TrophyIcon },
  ];

  const adminItems = [
    { to: '/academy/admin', label: 'Admin Dashboard', icon: Cog6ToothIcon },
    { to: '/academy/admin/curriculum', label: 'Content Manager', icon: PencilSquareIcon },
    { to: '/academy/admin/franchisees', label: 'Franchisee Progress', icon: ChartBarIcon },
    { to: '/academy/admin/badges', label: 'Manage Badges', icon: TrophyIcon },
  ];

  return (
    <aside
      className={`
        flex flex-col h-full bg-white
        transition-all duration-300 ease-out
        ${isMobile ? 'w-full' : isCollapsed ? 'w-16' : 'w-64'}
      `}
    >
      {/* Stats Bar (when expanded) */}
      {(!isCollapsed || isMobile) && (
        <div className="px-4 py-3 border-b border-neutral-100 bg-gradient-to-r from-brand-navy/5 to-indigo-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <SparklesIcon className="h-4 w-4 text-brand-navy" />
                <span className="text-sm font-semibold text-brand-navy">{currentPoints.toLocaleString()}</span>
              </div>
              {badgesEarned > 0 && (
                <div className="flex items-center gap-1">
                  <TrophyIcon className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-semibold text-amber-600">{badgesEarned}</span>
                </div>
              )}
            </div>
            {currentStreak > 0 && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-brand-navy/10 rounded-full">
                <span className="text-xs">🔥</span>
                <span className="text-xs font-medium text-brand-navy">{currentStreak}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {/* Journey Section */}
        {renderSectionHeader('Journey', RocketLaunchIcon)}
        {journeyItems.map(renderNavItem)}

        {/* Learning Section */}
        {renderSectionHeader('Learning', BookOpenIcon)}
        {learningItems.map(renderNavItem)}

        {/* Progress Section */}
        {renderSectionHeader('Progress', TrophyIcon)}
        {progressItems.map(renderNavItem)}

        {/* Admin Section (main branch only) */}
        {isMainBranch && (
          <>
            {renderSectionHeader('Admin', Cog6ToothIcon)}
            {adminItems.map(renderNavItem)}
          </>
        )}
      </nav>

      {/* Collapse Toggle - Desktop only */}
      {!isMobile && (
        <div className="border-t border-neutral-100 p-2">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 rounded-lg transition-colors duration-200"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronRightIcon className="h-5 w-5" />
            ) : (
              <>
                <ChevronLeftIcon className="h-5 w-5" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Back to Operations Link */}
      <div className="border-t border-neutral-100 p-2">
        {(isCollapsed && !isMobile) ? (
          <Tooltip title="Back to Operations" placement="right" arrow>
            <Link
              to="/"
              className="flex items-center justify-center px-3 py-2 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 rounded-lg transition-colors duration-200"
            >
              <HomeIcon className="h-5 w-5" />
            </Link>
          </Tooltip>
        ) : (
          <Link
            to="/"
            className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 rounded-lg transition-colors duration-200"
          >
            <HomeIcon className="h-5 w-5" />
            <span>Back to Operations</span>
          </Link>
        )}
      </div>
    </aside>
  );
}
