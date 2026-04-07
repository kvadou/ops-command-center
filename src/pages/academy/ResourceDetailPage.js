import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeftIcon,
  FolderIcon,
  BriefcaseIcon,
  AcademicCapIcon,
  MegaphoneIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  BookOpenIcon,
  DocumentTextIcon,
  CalendarIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import FranchiseAcademyLayout from '../../components/academy/layout/FranchiseAcademyLayout';
import { RichTextViewer } from '../../components/academy/editor/AcademyRichTextEditor';

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

// Color classes for categories
const getCategoryColorClasses = (color) => {
  const colors = {
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    purple: 'bg-purple-100 text-purple-700 border-purple-200',
    pink: 'bg-pink-100 text-pink-700 border-pink-200',
    green: 'bg-green-100 text-green-700 border-green-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200',
    cyan: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    slate: 'bg-neutral-100 text-neutral-700 border-neutral-200',
    gray: 'bg-neutral-100 text-neutral-700 border-neutral-200',
  };
  return colors[color] || colors.slate;
};

/**
 * ResourceDetailPage - Dedicated page for viewing a single resource
 * Accessible at /academy/resources/:resourceId
 * Can be linked from Earl AI Coach and other places
 */
export default function ResourceDetailPage() {
  const { resourceId } = useParams();
  const navigate = useNavigate();
  const [resource, setResource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch resource data
  useEffect(() => {
    const fetchResource = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/academy/resources/${resourceId}`, {
          credentials: 'include',
        });

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Resource not found');
          }
          throw new Error('Failed to fetch resource');
        }

        const data = await response.json();
        setResource(data);
      } catch (err) {
        console.error('Error fetching resource:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (resourceId) {
      fetchResource();
    }
  }, [resourceId]);

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Get category info
  const categoryInfo = resource ? CATEGORIES[resource.category] || CATEGORIES.general : CATEGORIES.general;
  const CategoryIcon = categoryInfo.icon;

  return (
    <FranchiseAcademyLayout>
      <div className="min-h-screen bg-neutral-50">
        {/* Breadcrumb / Back Navigation */}
        <div className="bg-white border-b border-neutral-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <Link
              to="/academy/resources"
              className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back to Resource Library
            </Link>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {loading ? (
            // Loading State
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-8">
              <div className="animate-pulse space-y-4">
                <div className="h-8 bg-neutral-200 rounded w-3/4"></div>
                <div className="h-4 bg-neutral-200 rounded w-1/4"></div>
                <div className="h-px bg-neutral-200 my-6"></div>
                <div className="space-y-3">
                  <div className="h-4 bg-neutral-200 rounded w-full"></div>
                  <div className="h-4 bg-neutral-200 rounded w-full"></div>
                  <div className="h-4 bg-neutral-200 rounded w-5/6"></div>
                  <div className="h-4 bg-neutral-200 rounded w-4/5"></div>
                </div>
              </div>
            </div>
          ) : error ? (
            // Error State
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-8 text-center">
              <div className="text-red-500 mb-4">
                <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-neutral-900 mb-2">
                {error === 'Resource not found' ? 'Resource Not Found' : 'Error Loading Resource'}
              </h2>
              <p className="text-neutral-600 mb-6">
                {error === 'Resource not found'
                  ? "The resource you're looking for doesn't exist or may have been removed."
                  : 'There was a problem loading this resource. Please try again.'}
              </p>
              <Link
                to="/academy/resources"
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-navy text-white rounded-lg hover:bg-brand-navy/90 transition-colors"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Back to Resource Library
              </Link>
            </div>
          ) : resource ? (
            // Resource Content
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
              {/* Header */}
              <div className="px-6 py-6 border-b border-neutral-200 bg-gradient-to-r from-neutral-50 to-white">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 mb-3">
                      {resource.title}
                    </h1>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      {/* Category Badge */}
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border ${getCategoryColorClasses(categoryInfo.color)}`}>
                        <CategoryIcon className="h-4 w-4" />
                        {categoryInfo.label}
                      </span>

                      {/* Last Updated */}
                      {resource.updated_at && (
                        <span className="inline-flex items-center gap-1.5 text-neutral-500">
                          <CalendarIcon className="h-4 w-4" />
                          Updated {formatDate(resource.updated_at)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* External File Link */}
                  {resource.file_url && (
                    <a
                      href={resource.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand-navy border border-brand-navy rounded-lg hover:bg-brand-navy hover:text-white transition-colors"
                    >
                      <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                      Open File
                    </a>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="px-6 py-8">
                {resource.content || resource.content_rich ? (
                  <RichTextViewer
                    content={resource.content_rich || resource.content}
                    className="prose-lg"
                  />
                ) : resource.file_url ? (
                  <div className="text-center py-12">
                    <DocumentTextIcon className="h-16 w-16 mx-auto text-neutral-300 mb-4" />
                    <p className="text-neutral-600 mb-4">
                      This resource is an external file.
                    </p>
                    <a
                      href={resource.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-brand-navy text-white rounded-lg hover:bg-brand-navy/90 transition-colors"
                    >
                      <ArrowTopRightOnSquareIcon className="h-5 w-5" />
                      Open External File
                    </a>
                  </div>
                ) : (
                  <p className="text-neutral-500 italic text-center py-8">
                    No content available for this resource.
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-neutral-200 bg-neutral-50">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-neutral-500">
                    Resource ID: {resource.id}
                    {resource.slug && ` • ${resource.slug}`}
                  </p>
                  <Link
                    to="/academy/resources"
                    className="text-sm font-medium text-brand-navy hover:text-brand-navy/80 transition-colors"
                  >
                    Browse All Resources
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </FranchiseAcademyLayout>
  );
}
