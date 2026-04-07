import { useLocation, useNavigate, Outlet, Navigate } from "react-router-dom";
import { DocumentTextIcon, Cog6ToothIcon, CalendarIcon } from '@heroicons/react/24/outline';

const TAB_CONFIG = [
  { label: "Form Submissions", value: "/pipeline", icon: DocumentTextIcon },
  { label: "Service Configuration", value: "/pipeline/services", icon: Cog6ToothIcon },
  { label: "Event Leads", value: "/pipeline/event-leads", icon: CalendarIcon },
];

export default function BookingHub() {
  const location = useLocation();
  const navigate = useNavigate();

  // Legacy redirect
  if (location.pathname === "/booking-hub" || location.pathname === "/booking-hub/") {
    return <Navigate to="/pipeline" replace />;
  }

  // Match longer paths first, then fall back to exact match for /pipeline
  const currentTab = TAB_CONFIG.slice().sort((a, b) => b.value.length - a.value.length).find(tab =>
    location.pathname === tab.value || location.pathname.startsWith(tab.value + '/')
  )?.value || "/pipeline";

  return (
    <div>
      {/* Tab Navigation */}
      <div className="border-b border-neutral-200 bg-white px-4 sm:px-6 lg:px-8">
        <nav className="flex gap-6 -mb-px">
          {TAB_CONFIG.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => navigate(tab.value)}
                className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-brand-purple text-brand-purple'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                }`}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <Outlet />
    </div>
  );
}
