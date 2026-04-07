import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { mobileTabItems, headerSections } from '../config/navigation';

export default function BottomTabBar() {
  const location = useLocation();
  const [showMore, setShowMore] = useState(false);

  return (
    <>
      {/* Bottom Tab Bar — mobile only */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-neutral-200 md:hidden">
        <div className="flex items-center justify-around h-[60px]">
          {mobileTabItems.map((item) => {
            const isMore = item.key === 'more';
            const isActive = !isMore && location.pathname.startsWith(item.path);

            if (isMore) {
              return (
                <button
                  key="more"
                  onClick={() => setShowMore(true)}
                  className="flex flex-col items-center justify-center gap-0.5 min-w-[64px] py-1"
                >
                  <item.icon className="h-6 w-6 text-neutral-400" />
                  <span className="text-[10px] font-medium text-neutral-400">More</span>
                </button>
              );
            }

            return (
              <Link
                key={item.key}
                to={item.path}
                className="flex flex-col items-center justify-center gap-0.5 min-w-[64px] py-1"
              >
                <item.icon className={`h-6 w-6 ${isActive ? 'text-[#6A469D]' : 'text-neutral-400'}`} />
                <span className={`text-[10px] font-medium ${isActive ? 'text-[#6A469D]' : 'text-neutral-400'}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* "More" Full Screen Overlay */}
      {showMore && (
        <div className="fixed inset-0 z-50 bg-white md:hidden">
          <div className="flex items-center justify-between px-4 h-14 border-b border-neutral-200">
            <h2 className="text-lg font-semibold text-neutral-900">All Sections</h2>
            <button onClick={() => setShowMore(false)} className="p-2">
              <XMarkIcon className="h-6 w-6 text-neutral-600" />
            </button>
          </div>
          <div className="p-4 space-y-2">
            {headerSections.map((section) => (
              <Link
                key={section.key}
                to={section.path}
                onClick={() => setShowMore(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-neutral-50 transition-colors"
              >
                <section.icon className="h-6 w-6 text-[#6A469D]" />
                <span className="text-base font-medium text-neutral-900">{section.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Spacer to prevent content from being hidden behind tab bar on mobile */}
      <div className="h-[60px] md:hidden" />
    </>
  );
}
