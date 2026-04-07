import { Link } from 'react-router-dom';
import { ChevronRightIcon } from '@heroicons/react/24/outline';

/**
 * Breadcrumbs - Workspace-aware breadcrumb navigation
 *
 * Usage:
 *   <Breadcrumbs items={[
 *     { label: 'People', to: '/people/tutors' },
 *     { label: 'Tutors', to: '/people/tutors' },
 *     { label: 'Hannah Kulawiak' },
 *   ]} />
 */
export default function Breadcrumbs({ items = [] }) {
  if (!items.length) return null;

  return (
    <nav className="flex items-center gap-1.5 text-sm mb-4" aria-label="Breadcrumb">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRightIcon className="h-3.5 w-3.5 text-neutral-400 flex-shrink-0" />}
            {isLast || !item.to ? (
              <span className="text-neutral-500 font-medium truncate max-w-[200px]">{item.label}</span>
            ) : (
              <Link
                to={item.to}
                className="text-[#6A469D] hover:text-[#2D2F8E] font-medium transition-colors"
              >
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
