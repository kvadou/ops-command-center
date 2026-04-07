import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCompanyName } from '../../contexts/CompanyNameContext';
import {
  MagnifyingGlassIcon,
  DocumentTextIcon,
  FolderIcon,
  BookOpenIcon,
  AcademicCapIcon,
  BriefcaseIcon,
  CurrencyDollarIcon,
  MegaphoneIcon,
  UserGroupIcon,
  ChevronRightIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import FranchiseAcademyLayout from '../../components/academy/layout/FranchiseAcademyLayout';
import AcademySidebar from '../../components/academy/layout/AcademySidebar';

// Category configuration
const CATEGORIES = {
  all: { label: 'All Resources', icon: FolderIcon, color: 'slate' },
  operations: { label: 'Operations', icon: BriefcaseIcon, color: 'blue' },
  training: { label: 'Training', icon: AcademicCapIcon, color: 'purple' },
  marketing: { label: 'Marketing', icon: MegaphoneIcon, color: 'pink' },
  hr: { label: 'HR & Staffing', icon: UserGroupIcon, color: 'green' },
  financial: { label: 'Financial', icon: CurrencyDollarIcon, color: 'amber' },
  creative: { label: 'Creative Assets', icon: DocumentTextIcon, color: 'cyan' },
  general: { label: 'General', icon: BookOpenIcon, color: 'slate' },
  internal: { label: 'Internal', icon: DocumentTextIcon, color: 'gray' },
};

/**
 * ResourceLibraryPage - Browse all franchise resources
 *
 * Features:
 * - Category filtering
 * - Search functionality
 * - Document viewer
 * - Responsive grid layout
 */
export default function ResourceLibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState([]);
  const [progress, setProgress] = useState(null);
  const { isMainBranch } = useCompanyName();

  const activeCategory = searchParams.get('category') || 'all';
  const searchQuery = searchParams.get('search') || '';

  useEffect(() => {
    fetchData();
  }, [activeCategory, searchQuery]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      if (activeCategory !== 'all') params.append('category', activeCategory);
      if (searchQuery) params.append('search', searchQuery);

      const [resourcesRes, progressRes] = await Promise.all([
        fetch(`/api/academy/resources?${params}`),
        fetch('/api/academy/progress'),
      ]);

      if (resourcesRes.ok) {
        const data = await resourcesRes.json();
        setResources(data);
      }

      if (progressRes.ok) {
        const data = await progressRes.json();
        setProgress(data);
      }
    } catch (error) {
      console.error('Error fetching resources:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = (category) => {
    const params = new URLSearchParams(searchParams);
    if (category === 'all') {
      params.delete('category');
    } else {
      params.set('category', category);
    }
    setSearchParams(params);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const search = formData.get('search');
    const params = new URLSearchParams(searchParams);
    if (search) {
      params.set('search', search);
    } else {
      params.delete('search');
    }
    setSearchParams(params);
  };

  const clearSearch = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('search');
    setSearchParams(params);
  };

  // Group resources by category for display
  const groupedResources = resources.reduce((acc, resource) => {
    const cat = resource.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(resource);
    return acc;
  }, {});

  if (loading) {
    return (
      <FranchiseAcademyLayout
        sidebar={<AcademySidebar isMainBranch={isMainBranch} />}
        progress={0}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-brand-navy/20 border-t-brand-navy" />
            <p className="text-neutral-500 font-medium">Loading Resources...</p>
          </div>
        </div>
      </FranchiseAcademyLayout>
    );
  }

  return (
    <FranchiseAcademyLayout
      sidebar={
        <AcademySidebar
          isMainBranch={isMainBranch}
          currentPoints={progress?.total_points || 0}
          currentStreak={progress?.current_streak_days || 0}
          badgesEarned={progress?.badges_earned || 0}
        />
      }
      progress={progress?.completion_percentage || 0}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Resource Library</h1>
            <p className="text-neutral-600 mt-1">
              Browse training materials, SOPs, and franchise resources
            </p>
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="relative w-full sm:w-72">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" />
            <input
              type="text"
              name="search"
              defaultValue={searchQuery}
              placeholder="Search resources..."
              className="w-full pl-10 pr-10 py-2 border border-neutral-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-brand-navy/30 focus:border-brand-navy
                       text-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            )}
          </form>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(CATEGORIES).map(([key, { label, icon: Icon, color }]) => (
            <button
              key={key}
              onClick={() => handleCategoryChange(key)}
              className={`
                inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm
                transition-colors
                ${activeCategory === key
                  ? 'bg-brand-navy text-white'
                  : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                }
              `}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Results Count */}
        {searchQuery && (
          <p className="text-sm text-neutral-500">
            {resources.length} result{resources.length !== 1 ? 's' : ''} for "{searchQuery}"
          </p>
        )}

        {/* Resource Grid */}
        {resources.length === 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
            <DocumentTextIcon className="h-12 w-12 mx-auto text-neutral-300 mb-4" />
            <h3 className="text-lg font-semibold text-neutral-900 mb-2">No resources found</h3>
            <p className="text-neutral-600">
              {searchQuery
                ? 'Try a different search term or category'
                : 'Resources will appear here once added'}
            </p>
          </div>
        ) : activeCategory === 'all' ? (
          // Grouped view for "All"
          <div className="space-y-8">
            {Object.entries(groupedResources).map(([category, items]) => {
              const catConfig = CATEGORIES[category] || CATEGORIES.general;
              const Icon = catConfig.icon;
              return (
                <div key={category}>
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-neutral-900 mb-4">
                    <Icon className="h-5 w-5 text-brand-navy" />
                    {catConfig.label}
                    <span className="text-sm font-normal text-neutral-400">({items.length})</span>
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {items.map((resource) => (
                      <ResourceCard
                        key={resource.id}
                        resource={resource}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // Flat grid for specific category
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {resources.map((resource) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
              />
            ))}
          </div>
        )}
      </div>
    </FranchiseAcademyLayout>
  );
}

/**
 * Resource Card Component
 * Opens resource detail page in a new tab for easy access from Earl AI Coach
 */
function ResourceCard({ resource }) {
  const catConfig = CATEGORIES[resource.category] || CATEGORIES.general;

  return (
    <a
      href={`/academy/resources/${resource.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-white rounded-xl border border-neutral-200 p-4 text-left
               hover:shadow-md hover:border-brand-navy/30 transition-all
               group block"
    >
      <div className="flex items-start gap-3">
        <div className={`
          p-2 rounded-lg bg-${catConfig.color}-100 group-hover:bg-${catConfig.color}-200
          transition-colors
        `}>
          <DocumentTextIcon className={`h-5 w-5 text-${catConfig.color}-600`} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-neutral-900 group-hover:text-brand-navy
                       transition-colors line-clamp-2">
            {resource.title}
          </h3>
          <p className="text-xs text-neutral-400 mt-1">
            {catConfig.label}
          </p>
        </div>
        <ChevronRightIcon className="h-5 w-5 text-neutral-300 group-hover:text-brand-navy
                                    transition-colors flex-shrink-0" />
      </div>
    </a>
  );
}

