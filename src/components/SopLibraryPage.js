import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '../utils/formatters';
import {
  MagnifyingGlassIcon,
  DocumentTextIcon,
  CogIcon,
  MegaphoneIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  ComputerDesktopIcon,
  ClockIcon,
  ExclamationCircleIcon,
  FunnelIcon,
  PlusIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';

const CATEGORY_CONFIG = {
  operations: {
    label: 'Operations',
    icon: CogIcon,
    bgColor: 'bg-brand-cyan',
    description: 'Day-to-day classroom, scheduling, TutorCruncher workflows',
  },
  marketing: {
    label: 'Marketing',
    icon: MegaphoneIcon,
    bgColor: 'bg-brand-pink',
    description: 'QR codes, ads, booking forms, lead generation',
  },
  'hr-staffing': {
    label: 'HR & Staffing',
    icon: UserGroupIcon,
    bgColor: 'bg-brand-green',
    description: 'Hiring, tutor onboarding, payroll',
  },
  finance: {
    label: 'Finance',
    icon: CurrencyDollarIcon,
    bgColor: 'bg-brand-yellow',
    description: 'Billing, invoicing, payments, reporting',
  },
  technology: {
    label: 'Technology',
    icon: ComputerDesktopIcon,
    bgColor: 'bg-brand-purple',
    description: 'OpsHub guides, TutorCruncher, Stripe, external tools',
  },
};

export default function SopLibraryPage() {
  const [sops, setSops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRequired, setFilterRequired] = useState('all');
  const [activeCategory, setActiveCategory] = useState('all');

  useEffect(() => {
    fetchSops();
  }, []);

  const fetchSops = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/knowledge/sops');
      const data = await response.json();
      setSops(data.sops || []);
    } catch (error) {
      console.error('Error fetching SOPs:', error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = sops.filter((sop) => {
    if (filterRequired === 'required' && !sop.sop_required) return false;
    if (filterRequired === 'optional' && sop.sop_required) return false;
    if (activeCategory !== 'all' && sop.collection_slug !== activeCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        sop.title.toLowerCase().includes(q) ||
        (sop.summary || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Group filtered SOPs by collection
  const grouped = filtered.reduce((acc, sop) => {
    const key = sop.collection_slug || 'uncategorized';
    if (!acc[key]) acc[key] = { title: sop.collection_title || 'Uncategorized', sops: [] };
    acc[key].sops.push(sop);
    return acc;
  }, {});

  // Category summary counts from all SOPs (unfiltered)
  const categoryCounts = sops.reduce((acc, sop) => {
    const key = sop.collection_slug || 'uncategorized';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-3 bg-brand-purple rounded-xl">
            <DocumentTextIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              Standard Operating Procedures
            </h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              Reference guides for running your Acme Operations franchise
            </p>
          </div>
        </div>

        {/* Search + Filter */}
        <div className="mt-6 flex gap-3 flex-col sm:flex-row">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search SOPs..."
              className="w-full pl-10 pr-4 py-2.5 text-sm text-neutral-900 bg-white border border-neutral-300 rounded-[10px] hover:border-neutral-400 focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/20 focus:outline-none placeholder:text-neutral-400 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-5 w-5 text-neutral-400" />
            {['all', 'required', 'optional'].map((f) => (
              <button
                key={f}
                onClick={() => setFilterRequired(f)}
                className={`px-3 py-2 rounded-[10px] text-sm font-medium transition-all duration-200 capitalize ${
                  filterRequired === f
                    ? 'bg-brand-purple text-white shadow-sm'
                    : 'bg-white text-neutral-600 border border-neutral-300 hover:bg-neutral-50 hover:border-neutral-400'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Category Cards */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Browse by Category</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <button
            onClick={() => setActiveCategory('all')}
            className={`group rounded-xl border p-4 text-left transition-all duration-200 ${
              activeCategory === 'all'
                ? 'border-brand-purple bg-brand-purple/5 shadow-sm'
                : 'border-neutral-200 bg-white hover:border-brand-purple/20 hover:shadow-sm'
            }`}
          >
            <div className="w-10 h-10 rounded-lg bg-neutral-500 flex items-center justify-center mb-3">
              <DocumentTextIcon className="h-5 w-5 text-white" />
            </div>
            <div className="text-sm font-semibold text-neutral-900">All SOPs</div>
            <div className="text-xs text-neutral-500 mt-1 tabular-nums">{sops.length} total</div>
          </button>

          {Object.entries(CATEGORY_CONFIG).map(([slug, config]) => {
            const Icon = config.icon;
            const count = categoryCounts[slug] || 0;
            return (
              <button
                key={slug}
                onClick={() => setActiveCategory(slug)}
                className={`group rounded-xl border p-4 text-left transition-all duration-200 ${
                  activeCategory === slug
                    ? 'border-brand-purple bg-brand-purple/5 shadow-sm'
                    : 'border-neutral-200 bg-white hover:border-brand-purple/20 hover:shadow-sm'
                }`}
              >
                <div className={`w-10 h-10 rounded-lg ${config.bgColor} flex items-center justify-center mb-3`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div className="text-sm font-semibold text-neutral-900">{config.label}</div>
                <div className="text-xs text-neutral-500 mt-1 tabular-nums">{count} SOP{count !== 1 ? 's' : ''}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* SOP List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse bg-white rounded-xl border border-neutral-200 p-5">
              <div className="h-5 bg-neutral-200 rounded w-2/3 mb-3" />
              <div className="h-4 bg-neutral-200 rounded w-full mb-2" />
              <div className="h-4 bg-neutral-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <DocumentTextIcon className="h-12 w-12 text-neutral-300 mb-4" />
          <h3 className="text-lg font-semibold text-neutral-600 mb-2">
            {searchQuery ? 'No SOPs match your search' : 'No SOPs published yet'}
          </h3>
          <p className="text-sm text-neutral-400 mb-6 max-w-sm">
            {searchQuery
              ? 'Try adjusting your search or filter criteria.'
              : 'SOPs will appear here once they are created and published.'}
          </p>
          {!searchQuery && (
            <Link
              to="/sop/new"
              className="inline-flex items-center gap-2 bg-brand-purple text-white hover:bg-brand-purple/90 rounded-[10px] px-4 py-2 text-sm font-medium transition-all duration-200 shadow-sm"
            >
              <PlusIcon className="h-5 w-5" />
              Create First SOP
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([slug, group]) => {
            const config = CATEGORY_CONFIG[slug];
            const Icon = config?.icon || DocumentTextIcon;
            const bgColor = config?.bgColor || 'bg-neutral-500';
            return (
              <div key={slug}>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-8 h-8 rounded-lg ${bgColor} flex items-center justify-center`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <h2 className="text-lg font-semibold text-neutral-900">{group.title}</h2>
                  <span className="text-sm text-neutral-500 tabular-nums">
                    {group.sops.length} SOP{group.sops.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {group.sops.map((sop) => (
                    <Link
                      key={sop.id}
                      to={`/sop/${sop.id}`}
                      className="group bg-white rounded-xl border border-neutral-200 p-5 hover:border-brand-purple/20 hover:shadow-md transition-all duration-200"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-sm font-semibold text-neutral-900 group-hover:text-brand-purple transition-colors flex-1 pr-3">
                          {sop.title}
                        </h3>
                        <div className="flex gap-1.5 flex-shrink-0">
                          {sop.sop_required && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#FCE8F0] text-[#DA2E72] rounded-sm text-xs font-medium">
                              <ExclamationCircleIcon className="h-3 w-3" />
                              Required
                            </span>
                          )}
                          {sop.sop_version && (
                            <span className="px-2 py-0.5 bg-neutral-100 text-neutral-500 rounded-sm text-xs">
                              v{sop.sop_version}
                            </span>
                          )}
                        </div>
                      </div>

                      {sop.summary && (
                        <p className="text-sm text-neutral-600 line-clamp-2 mb-3">{sop.summary}</p>
                      )}

                      <div className="flex items-center justify-between text-xs text-neutral-400">
                        <span className="flex items-center gap-1">
                          <ClockIcon className="h-3.5 w-3.5" />
                          Updated {formatDate(sop.updated_at)}
                        </span>
                        <div className="flex items-center gap-3">
                          {sop.sop_owner && (
                            <span>Owner: {sop.sop_owner}</span>
                          )}
                          <Link
                            to={`/sop/${sop.id}/edit`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-neutral-400 hover:text-brand-purple transition-colors"
                            aria-label={`Edit ${sop.title}`}
                          >
                            <PencilSquareIcon className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
