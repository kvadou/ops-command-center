import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useCompanyName } from '../../contexts/CompanyNameContext';
import {
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlayIcon,
  DocumentTextIcon,
  ClipboardDocumentCheckIcon,
  VideoCameraIcon,
  LockClosedIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import FranchiseAcademyLayout from '../../components/academy/layout/FranchiseAcademyLayout';
import AcademySidebar from '../../components/academy/layout/AcademySidebar';

/**
 * PhaseDetailPage - Shows modules within a phase
 *
 * Displays all modules for a given phase with their completion status
 * and allows navigation to individual modules.
 */
export default function PhaseDetailPage() {
  const { phaseId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState(null);
  const [progress, setProgress] = useState(null);
  const [moduleProgress, setModuleProgress] = useState({});
  const { isMainBranch } = useCompanyName();

  useEffect(() => {
    fetchData();
  }, [phaseId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [phaseRes, progressRes] = await Promise.all([
        fetch(`/api/academy/phases/${phaseId}`),
        fetch('/api/academy/progress'),
      ]);

      if (phaseRes.ok) {
        const phaseData = await phaseRes.json();
        setPhase(phaseData);
      }

      if (progressRes.ok) {
        const progressData = await progressRes.json();
        setProgress(progressData);

        // Build module progress lookup
        if (progressData.module_progress) {
          const lookup = {};
          progressData.module_progress.forEach((mp) => {
            lookup[mp.module_id] = mp;
          });
          setModuleProgress(lookup);
        }
      }
    } catch (error) {
      console.error('Error fetching phase data:', error);
    } finally {
      setLoading(false);
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

  const getModuleStatus = (module) => {
    const mp = moduleProgress[module.id];
    if (mp?.status === 'completed') return 'completed';
    if (mp?.status === 'in_progress') return 'in_progress';
    return 'not_started';
  };

  const handleStartModule = async (moduleId) => {
    try {
      await fetch(`/api/academy/modules/${moduleId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      // Navigate to module page (placeholder for now)
      navigate(`/academy/module/${moduleId}`);
    } catch (error) {
      console.error('Error starting module:', error);
    }
  };

  // Calculate phase progress
  const completedModules = phase?.modules?.filter(
    (m) => moduleProgress[m.id]?.status === 'completed'
  ).length || 0;
  const totalModules = phase?.modules?.length || 0;
  const phaseProgressPercent = totalModules > 0
    ? Math.round((completedModules / totalModules) * 100)
    : 0;

  if (loading) {
    return (
      <FranchiseAcademyLayout
        sidebar={<AcademySidebar isMainBranch={isMainBranch} />}
        progress={0}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-brand-navy/20 border-t-brand-navy" />
            <p className="text-neutral-500 font-medium">Loading Phase...</p>
          </div>
        </div>
      </FranchiseAcademyLayout>
    );
  }

  if (!phase) {
    return (
      <FranchiseAcademyLayout
        sidebar={<AcademySidebar isMainBranch={isMainBranch} />}
        progress={0}
      >
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-neutral-900 mb-2">Phase Not Found</h2>
          <p className="text-neutral-600 mb-4">The requested phase could not be found.</p>
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
        <nav className="flex items-center gap-2 text-sm">
          <Link
            to="/academy/journey"
            className="text-neutral-500 hover:text-neutral-700 flex items-center gap-1"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            Journey
          </Link>
          <span className="text-neutral-300">/</span>
          <span className="text-neutral-900 font-medium">Phase {phase.phase_number}</span>
        </nav>

        {/* Phase Header */}
        <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-brand-navy/10 text-brand-navy">
                  Phase {phase.phase_number}
                </span>
                <span className="text-xs text-neutral-500">{phase.duration_days} days</span>
              </div>
              <h1 className="text-2xl font-bold text-neutral-900 mb-2">{phase.title}</h1>
              <p className="text-neutral-600">{phase.description}</p>
            </div>
            <div className="flex-shrink-0 text-right">
              <div className="text-3xl font-bold text-brand-navy">{phaseProgressPercent}%</div>
              <div className="text-xs text-neutral-500">
                {completedModules} of {totalModules} modules
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4 h-2 bg-neutral-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-navy to-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${phaseProgressPercent}%` }}
            />
          </div>
        </div>

        {/* Modules List */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-900">Modules</h2>

          {phase.modules?.map((module, index) => {
            const status = getModuleStatus(module);
            const Icon = getModuleIcon(module.content_type);
            const isCompleted = status === 'completed';
            const isInProgress = status === 'in_progress';

            return (
              <div
                key={module.id}
                className={`
                  bg-white rounded-xl border-2 p-4 transition-all duration-200 cursor-pointer
                  ${isCompleted
                    ? 'border-emerald-200 bg-emerald-50/30 hover:border-emerald-300 hover:shadow-sm'
                    : isInProgress
                      ? 'border-brand-navy/30 bg-brand-navy/5 hover:shadow-sm'
                      : 'border-neutral-200 hover:border-brand-navy/30 hover:shadow-sm'
                  }
                `}
                onClick={() => handleStartModule(module.id)}
              >
                <div className="flex items-center gap-4">
                  {/* Status Icon */}
                  <div className={`
                    w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0
                    ${isCompleted
                      ? 'bg-emerald-100 text-emerald-600'
                      : isInProgress
                        ? 'bg-brand-navy/10 text-brand-navy'
                        : 'bg-neutral-100 text-neutral-500'
                    }
                  `}>
                    {isCompleted ? (
                      <CheckCircleSolidIcon className="h-6 w-6" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>

                  {/* Module Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-neutral-900">{module.title}</h3>
                      {module.is_gate && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-violet-100 text-violet-700">
                          Required
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-neutral-600 line-clamp-1">{module.description}</p>
                  </div>

                  {/* Points & Action */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-sm text-neutral-500">
                      <SparklesIcon className="h-4 w-4" />
                      <span>{module.points_value} pts</span>
                    </div>
                    <ChevronRightIcon className={`h-5 w-5 ${isCompleted ? 'text-emerald-400' : 'text-neutral-400'}`} />
                  </div>
                </div>
              </div>
            );
          })}

          {(!phase.modules || phase.modules.length === 0) && (
            <div className="text-center py-8 bg-neutral-50 rounded-xl border border-neutral-200">
              <p className="text-neutral-500">No modules in this phase yet.</p>
            </div>
          )}
        </div>

        {/* Phase Completion Reward */}
        {phase.badge_on_complete && (
          <div className="bg-gradient-to-r from-brand-purple/10 to-brand-navy/10 rounded-xl border border-brand-purple/20 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-purple/10 rounded-lg">
                <SparklesIcon className="h-6 w-6 text-brand-purple" />
              </div>
              <div>
                <div className="font-semibold text-neutral-900">Phase Completion Reward</div>
                <div className="text-sm text-neutral-600">
                  Complete all modules to earn the <span className="font-medium text-brand-purple">
                    {phase.badge_on_complete.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </span> badge and {phase.points_on_complete} bonus points!
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </FranchiseAcademyLayout>
  );
}
