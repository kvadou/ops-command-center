import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCompanyName } from '../../contexts/CompanyNameContext';
import {
  CheckCircleIcon,
  LockClosedIcon,
  ChevronRightIcon,
  ClockIcon,
  SparklesIcon,
  PlayIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import FranchiseAcademyLayout from '../../components/academy/layout/FranchiseAcademyLayout';
import AcademySidebar from '../../components/academy/layout/AcademySidebar';

/**
 * JourneyPage - 90-Day Journey overview with phases
 *
 * Shows all phases with their progress, allowing users to navigate
 * to individual phase details.
 */
export default function JourneyPage() {
  const [loading, setLoading] = useState(true);
  const [program, setProgram] = useState(null);
  const [progress, setProgress] = useState(null);
  const { isMainBranch } = useCompanyName();
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch program data and progress in parallel
      const [programRes, progressRes] = await Promise.all([
        fetch('/api/academy/programs/90-day-launch'),
        fetch('/api/academy/progress'),
      ]);

      if (programRes.ok) {
        const programData = await programRes.json();
        setProgram(programData);
      }

      if (progressRes.ok) {
        const progressData = await progressRes.json();
        setProgress(progressData);
      } else {
        // Initialize progress if not found
        setProgress({
          status: 'not_started',
          current_phase: 1,
          total_points: 0,
          current_streak_days: 0,
          phase_progress: {},
        });
      }
    } catch (error) {
      console.error('Error fetching journey data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartJourney = async () => {
    try {
      const response = await fetch('/api/academy/progress', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'in_progress',
          start_date: new Date().toISOString().split('T')[0],
        }),
      });

      if (response.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error('Error starting journey:', error);
    }
  };

  const getPhaseStatus = (phase) => {
    if (!progress) return 'locked';

    const phaseProgress = progress.phase_progress?.[phase.id];
    if (phaseProgress?.status === 'completed') return 'completed';

    // Check if this phase is unlocked
    if (phase.phase_number === 1) return progress.status === 'not_started' ? 'locked' : 'in_progress';
    if (phase.phase_number <= progress.current_phase) return 'in_progress';

    // Check unlock requirements
    const prevPhaseCompleted = progress.phase_progress?.[phase.phase_number - 1]?.status === 'completed';
    if (prevPhaseCompleted) return 'in_progress';

    return 'locked';
  };

  const getPhaseProgress = (phase) => {
    const phaseProgress = progress?.phase_progress?.[phase.id];
    return phaseProgress?.completion_percentage || 0;
  };

  // Updated to blue color scheme
  const phaseColors = {
    1: { bg: 'bg-brand-navy/5', border: 'border-brand-navy/20', accent: 'bg-brand-navy', text: 'text-brand-navy', icon: 'bg-brand-navy/10 text-brand-navy' },
    2: { bg: 'bg-brand-cyan/10', border: 'border-brand-cyan/30', accent: 'bg-brand-cyan', text: 'text-cyan-600', icon: 'bg-brand-cyan/20 text-cyan-600' },
    3: { bg: 'bg-brand-green/10', border: 'border-brand-green/30', accent: 'bg-brand-green', text: 'text-green-600', icon: 'bg-brand-green/20 text-green-600' },
  };

  if (loading) {
    return (
      <FranchiseAcademyLayout
        sidebar={<AcademySidebar isMainBranch={isMainBranch} />}
        progress={0}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-brand-navy/20 border-t-brand-navy" />
            <p className="text-neutral-500 font-medium">Loading Journey...</p>
          </div>
        </div>
      </FranchiseAcademyLayout>
    );
  }

  const overallProgress = progress?.completion_percentage || 0;

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
      progress={overallProgress}
    >
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">90-Day Launch Journey</h1>
            <p className="text-neutral-600 mt-1">
              Your guided path to franchise success
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-2xl font-bold text-brand-navy">{overallProgress}%</div>
              <div className="text-xs text-neutral-500">Complete</div>
            </div>
            <div className="w-32 h-3 bg-neutral-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-navy to-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Journey Not Started CTA */}
        {progress?.status === 'not_started' && (
          <div className="bg-gradient-to-r from-brand-navy to-indigo-500 rounded-xl p-6 text-white shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold mb-2">Ready to Begin Your Journey?</h2>
                <p className="text-blue-100">
                  Click the button to start your 90-day program and unlock your first phase.
                </p>
              </div>
              <button
                onClick={handleStartJourney}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-brand-navy font-semibold rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap shadow-md"
              >
                <PlayIcon className="h-5 w-5" />
                Start Now
              </button>
            </div>
          </div>
        )}

        {/* Timeline / Phases */}
        <div className="space-y-4">
          {program?.phases?.map((phase, index) => {
            const status = getPhaseStatus(phase);
            const phaseProgress = getPhaseProgress(phase);
            const colors = phaseColors[phase.phase_number] || phaseColors[1];
            const isLocked = status === 'locked';
            const isCompleted = status === 'completed';
            const isActive = status === 'in_progress' && phase.phase_number === progress?.current_phase;

            return (
              <div
                key={phase.id}
                className={`
                  relative rounded-xl border-2 overflow-hidden transition-all duration-200
                  ${isLocked
                    ? 'bg-neutral-50 border-neutral-200 opacity-60'
                    : `${colors.bg} ${colors.border} hover:shadow-md cursor-pointer`
                  }
                  ${isActive ? 'ring-2 ring-brand-navy ring-offset-2' : ''}
                `}
                onClick={() => !isLocked && navigate(`/academy/journey/phase/${phase.id}`)}
              >
                {/* Progress bar at top */}
                {!isLocked && !isCompleted && (
                  <div className="h-1 bg-neutral-200">
                    <div
                      className={`h-full ${colors.accent} transition-all duration-500`}
                      style={{ width: `${phaseProgress}%` }}
                    />
                  </div>
                )}
                {isCompleted && <div className={`h-1 bg-emerald-500`} />}

                <div className="p-5 sm:p-6">
                  <div className="flex items-start gap-4">
                    {/* Phase Number / Icon */}
                    <div className={`
                      w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0
                      ${isLocked
                        ? 'bg-neutral-200 text-neutral-400'
                        : isCompleted
                          ? 'bg-emerald-100 text-emerald-600'
                          : colors.icon
                      }
                    `}>
                      {isLocked ? (
                        <LockClosedIcon className="h-6 w-6" />
                      ) : isCompleted ? (
                        <CheckCircleSolidIcon className="h-6 w-6" />
                      ) : (
                        <span className="text-xl font-bold">{phase.phase_number}</span>
                      )}
                    </div>

                    {/* Phase Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            {isActive && (
                              <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-brand-navy text-white uppercase">
                                Current
                              </span>
                            )}
                            {isCompleted && (
                              <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500 text-white uppercase">
                                Completed
                              </span>
                            )}
                          </div>
                          <h3 className={`text-lg font-semibold ${isLocked ? 'text-neutral-500' : 'text-neutral-900'}`}>
                            Phase {phase.phase_number}: {phase.title}
                          </h3>
                          <p className={`text-sm mt-1 ${isLocked ? 'text-neutral-400' : 'text-neutral-600'}`}>
                            {phase.description}
                          </p>
                        </div>

                        {!isLocked && (
                          <ChevronRightIcon className="h-5 w-5 text-neutral-400 flex-shrink-0" />
                        )}
                      </div>

                      {/* Phase Stats */}
                      <div className="flex items-center gap-4 mt-3">
                        <div className="flex items-center gap-1.5 text-sm text-neutral-500">
                          <ClockIcon className="h-4 w-4" />
                          <span>{phase.duration_days} days</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-neutral-500">
                          <SparklesIcon className="h-4 w-4" />
                          <span>{phase.points_on_complete} pts on complete</span>
                        </div>
                        {phase.badge_on_complete && (
                          <div className="flex items-center gap-1.5 text-sm text-neutral-500">
                            <TrophyIcon className="h-4 w-4" />
                            <span>Badge reward</span>
                          </div>
                        )}
                      </div>

                      {/* Progress indicator for in-progress phases */}
                      {!isLocked && !isCompleted && phaseProgress > 0 && (
                        <div className="mt-3 flex items-center gap-2">
                          <div className="flex-1 h-2 bg-white rounded-full overflow-hidden border border-neutral-200">
                            <div
                              className={`h-full ${colors.accent} rounded-full transition-all duration-500`}
                              style={{ width: `${phaseProgress}%` }}
                            />
                          </div>
                          <span className={`text-sm font-medium ${colors.text}`}>
                            {phaseProgress}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Fallback if no phases loaded yet */}
          {(!program?.phases || program.phases.length === 0) && (
            <div className="text-center py-12 bg-white rounded-xl border border-neutral-200">
              <div className="text-neutral-400 mb-4">
                <ClockIcon className="h-12 w-12 mx-auto" />
              </div>
              <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                Program Coming Soon
              </h3>
              <p className="text-neutral-600 max-w-md mx-auto">
                The 90-day launch program is being set up. Check back soon for your personalized journey.
              </p>
            </div>
          )}
        </div>

        {/* Completion Celebration (when all phases done) */}
        {progress?.status === 'completed' && (
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl p-6 text-white text-center shadow-lg">
            <TrophyIcon className="h-16 w-16 mx-auto mb-4 text-yellow-300" />
            <h2 className="text-2xl font-bold mb-2">Journey Complete!</h2>
            <p className="text-emerald-50 max-w-lg mx-auto">
              Congratulations! You've completed all phases of your 90-day launch journey.
              Continue exploring resources and using the AI Coach to keep growing your franchise.
            </p>
          </div>
        )}
      </div>
    </FranchiseAcademyLayout>
  );
}
