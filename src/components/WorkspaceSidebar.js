import { Link, useLocation } from 'react-router-dom';
import { sidebarConfig } from '../config/navigation';

export default function WorkspaceSidebar({ section }) {
  const location = useLocation();

  if (section === 'dashboard') return null;

  const items = sidebarConfig[section];
  if (!items || items.length === 0) return null;

  // Find the active item by longest prefix match (skip dividers)
  // Support query-param paths like /admin/settings?tab=Reports
  const fullPath = location.pathname + location.search;
  const linkItems = items.filter(item => !item.divider);
  const activeItem = linkItems.reduce((best, item) => {
    const hasQuery = item.path.includes('?');
    const match = hasQuery
      ? fullPath === item.path // exact match for query-param paths
      : (location.pathname === item.path || location.pathname.startsWith(item.path + '/'));
    if (match) {
      if (!best || item.path.length > best.path.length) return item;
    }
    return best;
  }, null);

  const activeClasses =
    'flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#6A469D] text-white transition-all duration-200';
  const inactiveClasses =
    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-neutral-600 hover:bg-[#F8F5FC] hover:text-[#6A469D] transition-all duration-200';

  // Capitalize section name for title
  const title = section.charAt(0).toUpperCase() + section.slice(1);

  return (
    <aside className="w-60 bg-white border-r border-neutral-200 sticky top-16 h-[calc(100vh-64px)] overflow-y-auto flex-shrink-0 hidden lg:block">
      <div className="px-4 pt-6 pb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          {title}
        </p>
      </div>
      <nav className="px-3 pb-6 space-y-0.5">
        {items.map((item, i) => {
          if (item.divider) {
            return (
              <div key={`divider-${i}`} className={`px-3 pt-4 pb-1.5 ${i > 0 ? 'mt-2 border-t border-neutral-100' : ''}`}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                  {item.label}
                </p>
              </div>
            );
          }
          const isActive = activeItem && activeItem.path === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={isActive ? activeClasses : inactiveClasses}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
