import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import {
  HomeIcon,
  UserCircleIcon,
  Bars3Icon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import NotificationCenter from "../../notifications/NotificationCenter";

/**
 * FranchiseAcademyLayout - Layout Component for Franchise Academy
 *
 * A dedicated full-bleed layout for the Franchise Academy portal featuring:
 * - Edge-to-edge header with company logo
 * - Navy blue brand color scheme
 * - Left sidebar navigation flush with edges
 * - Progress indicator in header
 */
export default function FranchiseAcademyLayout({
  children,
  sidebar,
  progress = 0,
  companyName,
  isMainBranch,
  onLogout
}) {
  const [user, setUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData && userData !== "undefined") {
      try {
        setUser(JSON.parse(userData));
      } catch (e) {
        console.error("Error parsing user data:", e);
      }
    }
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Error logging out:", error);
    }

    localStorage.removeItem("token");
    localStorage.removeItem("user");
    if (onLogout) {
      onLogout();
    } else {
      navigate("/login");
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-neutral-50">
      {/* Full-width Header - Edge to Edge */}
      <header className="relative bg-gradient-to-r from-brand-navy via-primary-600 to-brand-navy shadow-lg">
        <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          {/* Left: Mobile menu + Logo */}
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger */}
            {sidebar && (
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                aria-label="Open menu"
              >
                <Bars3Icon className="h-5 w-5 text-white" />
              </button>
            )}

            {/* Logo & Title */}
            <Link to="/academy" className="flex items-center gap-3 group">
              <div className="relative">
                <svg width="48" height="48" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl shadow-md group-hover:shadow-lg transition-shadow">
                  <rect width="80" height="80" rx="20" fill="#6366f1" />
                  <text x="40" y="34" textAnchor="middle" fill="white" fontSize="28" fontWeight="700" fontFamily="Poppins, sans-serif">A</text>
                  <text x="40" y="56" textAnchor="middle" fill="white" fontSize="14" fontWeight="500" fontFamily="Poppins, sans-serif" opacity="0.85">OPS</text>
                </svg>
                {/* Glow effect on hover */}
                <div className="absolute inset-0 rounded-xl bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-tight">
                  Franchise Academy
                </h1>
                <p className="text-xs text-blue-200 font-medium">
                  Acme Operations
                </p>
              </div>
            </Link>
          </div>

          {/* Center: Progress (desktop only) */}
          {progress > 0 && (
            <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full">
              <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider">
                Progress
              </span>
              <div className="w-32 lg:w-48 h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand-cyan to-brand-green rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
              <span className="text-sm font-bold text-white min-w-[3rem] text-right">
                {Math.round(progress)}%
              </span>
            </div>
          )}

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Academy Home Link */}
            <Link
              to="/academy"
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              title="Academy Home"
            >
              <HomeIcon className="h-5 w-5 text-white" />
            </Link>

            {/* Notifications */}
            <NotificationCenter />

            {/* Profile Dropdown */}
            <Menu as="div" className="relative">
              <MenuButton
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                title="Profile"
              >
                <UserCircleIcon className="h-5 w-5 text-white" />
              </MenuButton>
              <MenuItems
                className="absolute right-0 mt-2 w-56 origin-top-right rounded-xl bg-white shadow-xl ring-1 ring-black/5 focus:outline-none z-50"
                anchor="bottom end"
              >
                <div className="py-1">
                  <MenuItem>
                    {({ focus }) => (
                      <button
                        onClick={() => navigate("/profile")}
                        className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                          focus ? "bg-neutral-50 text-neutral-900" : "text-neutral-700"
                        }`}
                      >
                        View Profile
                      </button>
                    )}
                  </MenuItem>
                  <MenuItem>
                    {({ focus }) => (
                      <button
                        onClick={handleLogout}
                        className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                          focus ? "bg-red-50 text-red-700" : "text-neutral-700"
                        }`}
                      >
                        Log Out
                      </button>
                    )}
                  </MenuItem>
                </div>
              </MenuItems>
            </Menu>
          </div>
        </div>

        {/* Mobile Progress Bar */}
        {progress > 0 && (
          <div className="md:hidden px-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand-cyan to-brand-green rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
              <span className="text-xs font-bold text-white">
                {Math.round(progress)}%
              </span>
            </div>
          </div>
        )}
      </header>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && sidebar && (
        <>
          <div
            className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-72 bg-white z-50 shadow-2xl lg:hidden transform transition-transform duration-300">
            <div className="flex items-center justify-between p-4 border-b border-neutral-100 bg-gradient-to-r from-brand-navy to-primary-600">
              <div className="flex items-center gap-3">
                <svg width="32" height="32" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 rounded-lg">
                  <rect width="80" height="80" rx="20" fill="#6366f1" />
                  <text x="40" y="34" textAnchor="middle" fill="white" fontSize="28" fontWeight="700" fontFamily="Poppins, sans-serif">A</text>
                  <text x="40" y="56" textAnchor="middle" fill="white" fontSize="14" fontWeight="500" fontFamily="Poppins, sans-serif" opacity="0.85">OPS</text>
                </svg>
                <h2 className="text-base font-semibold text-white">Academy Menu</h2>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto h-[calc(100vh-65px)]">
              <div className="mobile-sidebar-content">
                {sidebar && React.cloneElement(sidebar, {
                  ...sidebar.props,
                  className: 'flex flex-col w-full',
                  isMobile: true
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Main Layout */}
      <div className="flex flex-1">
        {/* Desktop Sidebar - Flush with edge */}
        {sidebar && (
          <div className="hidden lg:block flex-shrink-0 border-r border-neutral-200 bg-white">
            {sidebar}
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 min-w-0">
          <div className="h-full px-4 sm:px-5 lg:px-6 py-4">
            <div className="max-w-[1600px] mx-auto">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
