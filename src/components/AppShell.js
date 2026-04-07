import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import axios from 'axios';
import {
  BellIcon,
  MagnifyingGlassIcon,
  Bars3Icon,
  ChevronDownIcon,
  XMarkIcon,
  UserIcon,
  AcademicCapIcon,
  UserGroupIcon,
  BriefcaseIcon,
} from '@heroicons/react/24/outline';
import { headerSections, sidebarConfig } from '../config/navigation';
import BottomTabBar from './BottomTabBar';
import WorkspaceSidebar from './WorkspaceSidebar';

const getActiveSection = (pathname) => {
  // Dashboard
  if (pathname === '/' || pathname === '/main' || pathname === '/home' || pathname.startsWith('/home/')) return 'dashboard';

  // Operations (merged pipeline + scheduling + legacy paths)
  if (pathname.startsWith('/ops') ||
      pathname.startsWith('/pipeline') || pathname.startsWith('/scheduling') ||
      pathname.startsWith('/booking-hub') || pathname.startsWith('/booking-forms') ||
      pathname.startsWith('/client-conversion') || pathname.startsWith('/client-management') ||
      pathname.startsWith('/retention') ||
      pathname.startsWith('/calendar') || pathname.startsWith('/jobs-dashboard') ||
      pathname.startsWith('/lessons-dashboard') || pathname.startsWith('/job-builder') ||
      pathname.startsWith('/jobs') || pathname.startsWith('/lessons') ||
      pathname.startsWith('/appointments')) return 'operations';

  // People (new + legacy paths)
  if (pathname.startsWith('/people') ||
      pathname.startsWith('/tutor-management') || pathname.startsWith('/student-management') ||
      pathname.startsWith('/tutors') || pathname.startsWith('/students') ||
      pathname.startsWith('/clients') || pathname.startsWith('/affiliates') ||
      pathname.startsWith('/referrals') || pathname.startsWith('/maps')) return 'people';

  // Schools (new + legacy paths)
  if (pathname.startsWith('/schools') ||
      pathname.startsWith('/school-partners') || pathname.startsWith('/school-dashboard')) return 'schools';

  // Clubs (new + legacy paths)
  if (pathname.startsWith('/clubs') ||
      pathname.startsWith('/club-management') || pathname.startsWith('/club-dashboard')) return 'clubs';

  // Marketing
  if (pathname.startsWith('/marketing') || pathname.startsWith('/ads-manager') ||
      pathname.startsWith('/marketing-analytics')) return 'marketing';

  // Analytics (new + legacy paths)
  if (pathname.startsWith('/analytics') || pathname.startsWith('/executive-reports') ||
      pathname.startsWith('/franchisee-analytics') || pathname.startsWith('/historical-analytics') ||
      pathname.startsWith('/forecast') || pathname.startsWith('/financial-intelligence') ||
      pathname.startsWith('/monthly-financials')) return 'analytics';

  // Admin (new + legacy paths)
  if (pathname.startsWith('/admin') ||
      pathname.startsWith('/users-page') || pathname.startsWith('/settings') ||
      pathname.startsWith('/policies') || pathname.startsWith('/sop') ||
      pathname.startsWith('/knowledge') || pathname.startsWith('/communications') ||
      pathname.startsWith('/accounting') || pathname.startsWith('/user-guide') ||
      pathname.startsWith('/videos') || pathname.startsWith('/devops')) return 'admin';

  return 'dashboard'; // fallback
};

const TYPE_ICONS = { tutor: AcademicCapIcon, client: UserGroupIcon, student: UserIcon, job: BriefcaseIcon };
const TYPE_LABELS = { tutor: 'Tutor', client: 'Client', student: 'Student', job: 'Job' };

export default function AppShell({ children, user, onSignOut }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const searchRef = useRef(null);
  const searchInputRef = useRef(null);
  const debounceRef = useRef(null);

  // Search logic
  useEffect(() => {
    if (searchQuery.trim().length < 2) { setSearchResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await axios.get(`/api/search?q=${encodeURIComponent(searchQuery)}`);
        setSearchResults(data.results || []);
        setSearchOpen(true);
        setHighlightIdx(-1);
      } catch { setSearchResults([]); }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery]);

  // Close search on click outside
  useEffect(() => {
    const handler = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close search on navigation
  useEffect(() => { setSearchOpen(false); setSearchQuery(''); }, [location.pathname]);

  // Cmd+K / Ctrl+K to focus search
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const activeSection = getActiveSection(location.pathname);

  const isActive = (section) => section.key === activeSection;

  // Detect current section name for mobile header
  const currentSection = headerSections?.find((s) => s.key === activeSection);
  const currentSectionLabel = currentSection?.label || 'OpsHub';

  // Track groups for separators
  let lastGroup = null;

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Top Header — desktop/tablet only */}
      <header className="sticky top-0 z-40 bg-white border-b border-neutral-200 hidden md:block">
        <div className="flex items-center justify-between h-16 px-4 lg:px-6">
          {/* Left: Logo + Nav */}
          <div className="flex items-center">
            <Link to="/" className="flex items-center gap-2">
              <svg width="32" height="32" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-8 w-8">
                <rect width="80" height="80" rx="20" fill="#6366f1" />
                <text x="40" y="34" textAnchor="middle" fill="white" fontSize="28" fontWeight="700" fontFamily="Poppins, sans-serif">A</text>
                <text x="40" y="56" textAnchor="middle" fill="white" fontSize="14" fontWeight="500" fontFamily="Poppins, sans-serif" opacity="0.85">OPS</text>
              </svg>
              <span className="text-lg font-bold text-[#6366f1]">Acme Ops</span>
            </Link>

            <nav className="flex items-center ml-8 gap-1">
              {headerSections?.map((section, idx) => {
                const showSeparator =
                  lastGroup !== null && section.group !== lastGroup;
                lastGroup = section.group;

                return (
                  <React.Fragment key={section.path}>
                    {showSeparator && (
                      <div className="w-px h-5 bg-neutral-200 mx-1" />
                    )}
                    <Link
                      to={section.path}
                      className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                        isActive(section)
                          ? 'text-[#6A469D] font-semibold bg-[#6A469D]/10'
                          : 'text-neutral-600 hover:text-[#6A469D] hover:bg-neutral-50'
                      }`}
                    >
                      {section.label}
                    </Link>
                  </React.Fragment>
                );
              })}
            </nav>
          </div>

          {/* Right: Search + Bell + Avatar */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative" ref={searchRef}>
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search ops...  ⌘K"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                onKeyDown={(e) => {
                  if (!searchOpen || searchResults.length === 0) return;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHighlightIdx(prev => Math.min(prev + 1, searchResults.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHighlightIdx(prev => Math.max(prev - 1, 0));
                  } else if (e.key === 'Enter' && highlightIdx >= 0) {
                    e.preventDefault();
                    navigate(searchResults[highlightIdx].url);
                    setSearchOpen(false);
                    setSearchQuery('');
                  } else if (e.key === 'Escape') {
                    setSearchOpen(false);
                  }
                }}
                className="bg-neutral-100 rounded-lg pl-8 pr-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-[#6A469D]/30 focus:bg-white focus:w-64 transition-all"
              />
              {searchOpen && searchResults.length > 0 && (
                <div className="absolute right-0 mt-1 w-80 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-50 max-h-96 overflow-y-auto">
                  {searchResults.map((r, idx) => {
                    const Icon = TYPE_ICONS[r.type] || UserIcon;
                    const isHighlighted = idx === highlightIdx;
                    return (
                      <Link
                        key={`${r.type}-${r.id}`}
                        to={r.url}
                        className={`flex items-center gap-3 px-3 py-2 transition-colors ${isHighlighted ? 'bg-[#6A469D]/10 text-[#6A469D]' : 'hover:bg-neutral-50'}`}
                        onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                        onMouseEnter={() => setHighlightIdx(idx)}
                      >
                        <Icon className="h-4 w-4 text-neutral-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-800 truncate">{r.name}</p>
                        </div>
                        <span className="text-xs text-neutral-400 capitalize">{TYPE_LABELS[r.type] || r.type}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Notification Bell */}
            <button className="relative p-1.5 text-neutral-500 hover:text-neutral-700 transition-colors">
              <BellIcon className="h-5 w-5" />
              <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full" />
            </button>

            {/* User Avatar Menu */}
            <Menu as="div" className="relative">
              <MenuButton className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
                <img
                  src={user?.avatar_url || '/logo512.png'}
                  alt={user?.first_name || 'User'}
                  className="h-8 w-8 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <ChevronDownIcon className="h-4 w-4 text-neutral-400" />
              </MenuButton>
              <MenuItems className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-50">
                <div className="px-3 py-2 border-b border-neutral-100">
                  <p className="text-sm font-medium text-neutral-900">
                    {user?.first_name} {user?.last_name}
                  </p>
                  <p className="text-xs text-neutral-500 truncate">
                    {user?.email}
                  </p>
                </div>
                <MenuItem>
                  {({ active }) => (
                    <button
                      onClick={onSignOut}
                      className={`w-full text-left px-3 py-2 text-sm ${
                        active
                          ? 'bg-neutral-50 text-neutral-900'
                          : 'text-neutral-700'
                      }`}
                    >
                      Sign out
                    </button>
                  )}
                </MenuItem>
              </MenuItems>
            </Menu>
          </div>
        </div>
      </header>

      {/* Mobile Top Bar — mobile only */}
      <header className="sticky top-0 z-40 bg-white border-b border-neutral-200 md:hidden">
        <div className="flex items-center justify-between h-14 px-4">
          {/* Hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 text-neutral-600"
          >
            {mobileMenuOpen ? (
              <XMarkIcon className="h-6 w-6" />
            ) : (
              <Bars3Icon className="h-6 w-6" />
            )}
          </button>

          {/* Section Title */}
          <span className="text-sm font-semibold text-neutral-900">
            {currentSectionLabel}
          </span>

          {/* Avatar */}
          <img
            src={user?.avatar_url || '/logo512.png'}
            alt={user?.first_name || 'User'}
            className="h-7 w-7 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>

        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <div className="border-t border-neutral-100 bg-white px-4 py-3 space-y-1 max-h-[70vh] overflow-y-auto">
            {headerSections?.map((section) => {
              const isCurrent = isActive(section);
              const subItems = isCurrent ? (sidebarConfig[section.key] || []).filter(item => !item.divider) : [];
              return (
                <div key={section.path}>
                  <Link
                    to={section.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-3 py-2 rounded-lg text-sm ${
                      isCurrent
                        ? 'bg-[#6A469D]/10 text-[#6A469D] font-semibold'
                        : 'text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    {section.label}
                  </Link>
                  {subItems.length > 0 && (
                    <div className="ml-4 mt-1 mb-2 space-y-0.5 border-l-2 border-[#6A469D]/10 pl-3">
                      {subItems.map((item) => {
                        const isSubActive = location.pathname === item.path;
                        return (
                          <Link
                            key={item.path}
                            to={item.path}
                            onClick={() => setMobileMenuOpen(false)}
                            className={`block px-2 py-1.5 rounded text-sm ${
                              isSubActive
                                ? 'text-[#6A469D] font-medium'
                                : 'text-neutral-500 hover:text-neutral-700'
                            }`}
                          >
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </header>

      {/* Content */}
      {activeSection === 'dashboard' ? (
        <div className="min-h-[calc(100vh-64px)]">{children}</div>
      ) : (
        <div className="flex min-h-[calc(100vh-64px)]">
          <WorkspaceSidebar section={activeSection} />
          <main className="flex-1 bg-neutral-50 overflow-y-auto p-4 sm:p-6">
            {children}
          </main>
        </div>
      )}

      {/* Mobile Bottom Tab Bar */}
      {typeof BottomTabBar !== 'undefined' && <BottomTabBar />}
    </div>
  );
}
