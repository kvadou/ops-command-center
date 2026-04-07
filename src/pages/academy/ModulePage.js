import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useCompanyName } from '../../contexts/CompanyNameContext';
import {
  ChevronLeftIcon,
  CheckCircleIcon,
  SparklesIcon,
  VideoCameraIcon,
  DocumentTextIcon,
  ClipboardDocumentCheckIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import FranchiseAcademyLayout from '../../components/academy/layout/FranchiseAcademyLayout';
import AcademySidebar from '../../components/academy/layout/AcademySidebar';
import ChecklistModule from '../../components/academy/modules/ChecklistModule';
import DocumentModule from '../../components/academy/modules/DocumentModule';

/**
 * ModulePage - Individual module content view
 *
 * Displays module content based on content_type:
 * - 'checklist' - Interactive checklist with toggle
 * - 'document' - Rich text/markdown content
 * - 'video' - Video player (placeholder for future)
 */
export default function ModulePage() {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [module, setModule] = useState(null);
  const [progress, setProgress] = useState(null);
  const [checklistProgress, setChecklistProgress] = useState({});
  const [moduleProgress, setModuleProgress] = useState(null);
  const { isMainBranch } = useCompanyName();

  useEffect(() => {
    fetchData();
  }, [moduleId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [moduleRes, progressRes] = await Promise.all([
        fetch(`/api/academy/modules/${moduleId}`),
        fetch('/api/academy/progress'),
      ]);

      if (moduleRes.ok) {
        const moduleData = await moduleRes.json();
        setModule(moduleData);
      } else {
        console.error('Module not found');
      }

      if (progressRes.ok) {
        const progressData = await progressRes.json();
        setProgress(progressData);

        // Build checklist progress lookup
        if (progressData.checklist_progress) {
          const lookup = {};
          progressData.checklist_progress.forEach((cp) => {
            lookup[cp.checklist_item_id] = cp;
          });
          setChecklistProgress(lookup);
        }

        // Find module progress
        if (progressData.module_progress) {
          const mp = progressData.module_progress.find(
            (m) => m.module_id === parseInt(moduleId)
          );
          setModuleProgress(mp);
        }
      }
    } catch (error) {
      console.error('Error fetching module data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChecklistToggle = async (itemId) => {
    try {
      const response = await fetch(`/api/academy/checklist/${itemId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const result = await response.json();
        // Update local state
        setChecklistProgress((prev) => ({
          ...prev,
          [itemId]: result,
        }));
        // Refresh progress data for points update
        const progressRes = await fetch('/api/academy/progress');
        if (progressRes.ok) {
          const progressData = await progressRes.json();
          setProgress(progressData);
        }
      }
    } catch (error) {
      console.error('Error toggling checklist item:', error);
    }
  };

  const handleCompleteModule = async () => {
    try {
      const response = await fetch(`/api/academy/modules/${moduleId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        // Refresh data
        await fetchData();
      }
    } catch (error) {
      console.error('Error completing module:', error);
    }
  };

  const getModuleIcon = (contentType) => {
    switch (contentType) {
      case 'video':
        return VideoCameraIcon;
      case 'checklist':
        return ClipboardDocumentCheckIcon;
      case 'document':
      default:
        return DocumentTextIcon;
    }
  };

  const getContentTypeLabel = (contentType) => {
    switch (contentType) {
      case 'video':
        return 'Video Lesson';
      case 'checklist':
        return 'Checklist';
      case 'document':
        return 'Document';
      default:
        return 'Module';
    }
  };

  // Calculate checklist completion
  const getChecklistCompletion = () => {
    if (!module?.checklist_items) return { completed: 0, total: 0, percent: 0 };

    const total = module.checklist_items.length;
    const completed = module.checklist_items.filter(
      (item) => checklistProgress[item.id]?.is_completed
    ).length;

    return {
      completed,
      total,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  };

  const isModuleCompleted = moduleProgress?.status === 'completed';

  if (loading) {
    return (
      <FranchiseAcademyLayout
        sidebar={<AcademySidebar isMainBranch={isMainBranch} />}
        progress={0}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-brand-navy/20 border-t-brand-navy" />
            <p className="text-neutral-500 font-medium">Loading Module...</p>
          </div>
        </div>
      </FranchiseAcademyLayout>
    );
  }

  if (!module) {
    return (
      <FranchiseAcademyLayout
        sidebar={<AcademySidebar isMainBranch={isMainBranch} />}
        progress={0}
      >
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-neutral-900 mb-2">Module Not Found</h2>
          <p className="text-neutral-600 mb-4">The requested module could not be found.</p>
          <Link
            to="/academy/journey"
            className="text-brand-navy hover:text-indigo-500 font-medium"
          >
            Return to Journey
          </Link>
        </div>
      </FranchiseAcademyLayout>
    );
  }

  const Icon = getModuleIcon(module.content_type);
  const checklistCompletion = getChecklistCompletion();

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
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm flex-wrap">
          <Link
            to="/academy/journey"
            className="text-neutral-500 hover:text-neutral-700 flex items-center gap-1"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            Journey
          </Link>
          <span className="text-neutral-300">/</span>
          <Link
            to={`/academy/journey/phase/${module.phase_id}`}
            className="text-neutral-500 hover:text-neutral-700"
          >
            Phase {module.phase_number}
          </Link>
          <span className="text-neutral-300">/</span>
          <span className="text-neutral-900 font-medium truncate">{module.title}</span>
        </nav>

        {/* Module Header */}
        <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className={`
                w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0
                ${isModuleCompleted
                  ? 'bg-emerald-100 text-emerald-600'
                  : 'bg-brand-navy/10 text-brand-navy'
                }
              `}>
                {isModuleCompleted ? (
                  <CheckCircleSolidIcon className="h-7 w-7" />
                ) : (
                  <Icon className="h-6 w-6" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 text-xs font-semibold rounded bg-brand-navy/10 text-brand-navy">
                    {getContentTypeLabel(module.content_type)}
                  </span>
                  {module.is_gate && (
                    <span className="px-2 py-0.5 text-xs font-semibold rounded bg-violet-100 text-violet-700">
                      Required
                    </span>
                  )}
                  {isModuleCompleted && (
                    <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-100 text-emerald-700">
                      Completed
                    </span>
                  )}
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-1">{module.title}</h1>
                <p className="text-neutral-600 text-sm">{module.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 sm:flex-shrink-0">
              <div className="flex items-center gap-1 text-sm text-neutral-500">
                <SparklesIcon className="h-4 w-4" />
                <span>{module.points_value} pts</span>
              </div>
            </div>
          </div>

          {/* Progress for checklist modules */}
          {module.content_type === 'checklist' && (
            <div className="mt-4 pt-4 border-t border-neutral-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-neutral-600">
                  {checklistCompletion.completed} of {checklistCompletion.total} items completed
                </span>
                <span className="text-sm font-medium text-brand-navy">
                  {checklistCompletion.percent}%
                </span>
              </div>
              <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand-navy to-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${checklistCompletion.percent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Module Content */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
          {module.content_type === 'checklist' && module.checklist_items && (
            <ChecklistModule
              items={module.checklist_items}
              progress={checklistProgress}
              onToggle={handleChecklistToggle}
              isModuleCompleted={isModuleCompleted}
            />
          )}

          {module.content_type === 'document' && (
            <DocumentModule
              content={module.content}
              contentBlocks={module.content_blocks}
              moduleId={module.id}
            />
          )}

          {module.content_type === 'video' && (
            <div className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-brand-navy/10 rounded-xl flex items-center justify-center">
                <VideoCameraIcon className="h-8 w-8 text-brand-navy" />
              </div>
              <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                Video Coming Soon
              </h3>
              <p className="text-neutral-600 text-sm max-w-md mx-auto">
                Video content is being prepared. Check back soon for the full video lesson.
              </p>
              {module.content?.description && (
                <p className="mt-4 text-neutral-500 text-sm italic">
                  {module.content.description}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Complete Module Button */}
        {!isModuleCompleted && (
          <div className="flex justify-end">
            {module.content_type === 'checklist' ? (
              checklistCompletion.percent === 100 && (
                <button
                  onClick={handleCompleteModule}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-brand-navy text-white font-semibold rounded-lg hover:bg-primary-600 transition-colors shadow-md"
                >
                  <CheckCircleIcon className="h-5 w-5" />
                  Mark Module Complete
                </button>
              )
            ) : (
              <button
                onClick={handleCompleteModule}
                className="inline-flex items-center gap-2 px-6 py-3 bg-brand-navy text-white font-semibold rounded-lg hover:bg-primary-600 transition-colors shadow-md"
              >
                <CheckCircleIcon className="h-5 w-5" />
                Mark as Complete
              </button>
            )}
          </div>
        )}

        {/* Back to Phase Button */}
        <div className="pt-4 border-t border-neutral-200">
          <Link
            to={`/academy/journey/phase/${module.phase_id}`}
            className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-brand-navy transition-colors"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            Back to Phase {module.phase_number}: {module.phase_title}
          </Link>
        </div>
      </div>
    </FranchiseAcademyLayout>
  );
}
