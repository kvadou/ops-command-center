import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import EntityDetailPage, { ContactInfo, RelatedEntitiesList } from './EntityDetailPage';
import NotFound from './NotFound';
import {
  AcademicCapIcon,
  ChartBarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EnvelopeIcon,
  UserIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid';

export default function StudentDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [progressData, setProgressData] = useState(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [expandedModules, setExpandedModules] = useState({});

  useEffect(() => {
    fetch(`/api/entity-details/students/${id}`)
      .then(res => {
        if (!res.ok) {
          if (res.status === 404) {
            setError('not-found');
          } else {
            throw new Error('Failed to fetch student details');
          }
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (data) {
          setData(data);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Error:', err);
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (activeTab === 'progress' && !progressData) {
      setProgressLoading(true);
      fetch(`/api/student-management/${id}/progress`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) {
            setProgressData(data);
            // Auto-expand the current module
            const currentModule = data.modules?.find(m => m.percentage > 0 && m.percentage < 100);
            if (currentModule) {
              setExpandedModules({ [currentModule.module_id]: true });
            }
          }
        })
        .catch(err => console.error('Error loading progress:', err))
        .finally(() => setProgressLoading(false));
    }
  }, [activeTab, id, progressData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
          <p className="mt-4 text-neutral-600">Loading student details...</p>
        </div>
      </div>
    );
  }

  if (error === 'not-found') {
    return <NotFound entityType="Student" entityId={id} />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#AE255B]">Error: {error}</p>
        </div>
      </div>
    );
  }

  const { student, relatedClients, relatedLessons, tutorCruncherUrl } = data;

  const tabs = [
    { id: 'profile', name: 'Profile', icon: UserIcon },
    { id: 'progress', name: 'Progress', icon: AcademicCapIcon },
    { id: 'activity', name: 'Activity', icon: ChartBarIcon },
    { id: 'communications', name: 'Communications', icon: EnvelopeIcon }
  ];

  const initials = student.recipient_name
    ? student.recipient_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  // Helper to safely convert any value to string
  const safeString = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        return value.map(item => safeString(item)).filter(Boolean).join(', ');
      }
      return value.name || value.id || value.machine_name || JSON.stringify(value);
    }
    return String(value);
  };

  return (
          <EntityDetailPage
            title={`Student: ${student.recipient_name || 'Unknown'}`}
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tutorCruncherUrl={tutorCruncherUrl}
            backToListUrl="/people/students"
            backToListLabel="Student Management"
          >
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Contact */}
            <ContactInfo
              initials={initials}
              placeholderIcon={UserGroupIcon}
            />

            {/* Associated Clients */}
            <RelatedEntitiesList
              title="Associated Clients"
              entities={relatedClients}
              entityType="client"
              getLink={(client) => `/clients/${client.client_id}`}
              getName={(client) => `${client.first_name} ${client.last_name}`}
              getSubtitle={(client) => `Status: ${client.status || 'Unknown'}`}
              emptyMessage="No associated clients"
            />

            {/* Uploaded Documents */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">Uploaded Documents</h3>
              <p className="text-neutral-500">No Uploaded Documents</p>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Profile Details */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">Profile</h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm font-medium text-neutral-500">ID</dt>
                  <dd className="mt-1 text-sm text-neutral-900">{student.recipient_id}</dd>
                </div>
                {student.paying_client_name && (
                  <div>
                    <dt className="text-sm font-medium text-neutral-500">Paying Client</dt>
                    <dd className="mt-1 text-sm text-neutral-900">{student.paying_client_name}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">Notes</h3>
              <p className="text-neutral-500">No Notes</p>
            </div>

            {/* Related Lessons */}
            <RelatedEntitiesList
              title="Lessons"
              entities={relatedLessons}
              entityType="lesson"
              getLink={(lesson) => `/lessons/${lesson.appointment_id}`}
              getName={(lesson) => {
                const date = new Date(lesson.start);
                return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
              }}
              getSubtitle={(lesson) => `${lesson.service_name || 'Unknown Service'} • ${lesson.attendance_status || lesson.status || 'Unknown'}`}
              emptyMessage="No lessons found"
            />
          </div>
        </div>
      )}

      {activeTab === 'progress' && (
        <div className="space-y-6">
          {progressLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500 mx-auto"></div>
                <p className="mt-3 text-sm text-neutral-500">Loading curriculum progress...</p>
              </div>
            </div>
          ) : !progressData ? (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-8 text-center">
              <AcademicCapIcon className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
              <p className="text-neutral-500 text-sm">No curriculum progress data available yet.</p>
              <p className="text-neutral-400 text-xs mt-1">Progress will appear after lessons are tracked.</p>
            </div>
          ) : (
            <>
              {/* Current Band Badge */}
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
                <div className="flex flex-col items-center text-center">
                  {progressData.currentBand ? (
                    <>
                      <div
                        className="w-24 h-24 rounded-full flex items-center justify-center shadow-lg mb-3"
                        style={{ backgroundColor: progressData.currentBand.color }}
                      >
                        <span className={`text-lg font-bold ${
                          ['#FACC29', '#50C8DF'].includes(progressData.currentBand.color) ? 'text-neutral-800' : 'text-white'
                        }`}>
                          {progressData.currentBand.name.replace(' Band', '')}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-neutral-900">{progressData.currentBand.name}</h3>
                      <p className="text-sm text-neutral-500 mt-1">
                        {progressData.totalCompleted} of {progressData.totalLessons} total lessons completed
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="w-24 h-24 rounded-full flex items-center justify-center bg-neutral-200 shadow-lg mb-3">
                        <span className="text-lg font-bold text-neutral-500">--</span>
                      </div>
                      <h3 className="text-lg font-semibold text-neutral-500">Not Started</h3>
                      <p className="text-sm text-neutral-400 mt-1">
                        0 of {progressData.totalLessons} total lessons completed
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Module Timeline */}
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
                <h3 className="text-sm font-semibold text-neutral-700 uppercase tracking-wider mb-5">Module Progress</h3>
                <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
                  {progressData.modules.map((mod) => {
                    const isComplete = mod.percentage === 100;
                    const isCurrent = mod.percentage > 0 && mod.percentage < 100;
                    const isFuture = mod.percentage === 0;
                    return (
                      <div key={mod.module_id} className="flex flex-col items-center gap-2">
                        <div className="relative">
                          {isComplete && (
                            <div
                              className="w-12 h-12 rounded-full flex items-center justify-center shadow-md"
                              style={{ backgroundColor: mod.band_color }}
                            >
                              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            </div>
                          )}
                          {isCurrent && (
                            <div className="relative">
                              <div
                                className="w-12 h-12 rounded-full flex items-center justify-center shadow-md"
                                style={{ backgroundColor: mod.band_color }}
                              >
                                <span className={`text-xs font-bold ${
                                  ['#FACC29', '#50C8DF'].includes(mod.band_color) ? 'text-neutral-800' : 'text-white'
                                }`}>
                                  {mod.percentage}%
                                </span>
                              </div>
                              <div
                                className="absolute inset-0 rounded-full animate-ping opacity-20"
                                style={{ backgroundColor: mod.band_color }}
                              />
                            </div>
                          )}
                          {isFuture && (
                            <div
                              className="w-12 h-12 rounded-full flex items-center justify-center border-2"
                              style={{ borderColor: mod.band_color }}
                            >
                              <span className="text-xs font-semibold" style={{ color: mod.band_color }}>
                                {mod.module_number}
                              </span>
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] font-medium text-neutral-500 text-center leading-tight max-w-[60px]">
                          {mod.band_name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Overall Progress Bar */}
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-neutral-700">Overall Progress</h3>
                  <span className="text-sm font-medium text-neutral-600">
                    {progressData.totalCompleted} of {progressData.totalLessons} lessons ({progressData.overallPercentage}%)
                  </span>
                </div>
                <div className="w-full h-3 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${progressData.overallPercentage}%`,
                      background: 'linear-gradient(90deg, #34B256, #50C8DF, #6A469D)'
                    }}
                  />
                </div>
              </div>

              {/* Per-Module Expandable Sections */}
              <div className="space-y-3">
                {progressData.modules.map((mod) => {
                  const isExpanded = !!expandedModules[mod.module_id];
                  return (
                    <div key={mod.module_id} className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
                      <button
                        onClick={() => setExpandedModules(prev => ({ ...prev, [mod.module_id]: !prev[mod.module_id] }))}
                        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-neutral-50 transition-colors"
                      >
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: mod.band_color }}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-neutral-900">{mod.module_name}</span>
                          <span className="text-sm text-neutral-500 ml-2">{mod.band_name}</span>
                        </div>
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${
                          mod.percentage === 100
                            ? 'bg-[#E8F8ED] text-[#2A9147]'
                            : mod.percentage > 0
                              ? 'bg-[#FEF4E8] text-[#C77A26]'
                              : 'bg-neutral-100 text-neutral-500'
                        }`}>
                          {mod.completedCount}/{mod.totalCount}
                        </span>
                        {isExpanded
                          ? <ChevronDownIcon className="h-4 w-4 text-neutral-400 flex-shrink-0" />
                          : <ChevronRightIcon className="h-4 w-4 text-neutral-400 flex-shrink-0" />
                        }
                      </button>
                      <div
                        className={`transition-all duration-300 ease-in-out overflow-hidden ${
                          isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                        }`}
                      >
                        <div className="border-t border-neutral-100 px-5 py-3">
                          <ul className="divide-y divide-neutral-50">
                            {mod.lessons.map((lesson) => (
                              <li key={lesson.lesson_id} className="flex items-start gap-3 py-2.5">
                                {lesson.completed ? (
                                  <CheckCircleSolid className="h-5 w-5 text-[#34B256] flex-shrink-0 mt-0.5" />
                                ) : (
                                  <div className="h-5 w-5 rounded-full border-2 border-neutral-300 flex-shrink-0 mt-0.5" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm leading-snug ${
                                    lesson.completed ? 'text-neutral-700' : 'text-neutral-500'
                                  }`}>
                                    {lesson.name}
                                  </p>
                                  {lesson.completed && lesson.completed_at && (
                                    <p className="text-xs text-neutral-400 mt-0.5">
                                      {new Date(lesson.completed_at).toLocaleDateString()}
                                      {lesson.tutor_name && ` \u2022 ${lesson.tutor_name}`}
                                    </p>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="space-y-6">
          {/* Lesson History */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Lesson History</h3>
            {relatedLessons && relatedLessons.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Job</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Tutor</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {relatedLessons.slice(0, 50).map((lesson) => {
                      const startDate = new Date(lesson.start);
                      return (
                        <tr key={lesson.appointment_id} className="hover:bg-neutral-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-900">
                            <Link to={`/people/lessons/${lesson.appointment_id}`} className="text-primary-500 hover:text-primary-700 transition-colors">
                              {startDate.toLocaleDateString()} {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-sm text-neutral-700">
                            {lesson.service_id ? (
                              <Link to={`/jobs/${lesson.service_id}`} className="text-primary-500 hover:text-primary-700 transition-colors">
                                {safeString(lesson.service_name)}
                              </Link>
                            ) : (
                              safeString(lesson.service_name)
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-neutral-700">
                            {lesson.tutor_name ? (
                              <Link to={`/tutors/${lesson.tutor_id}`} className="text-primary-500 hover:text-primary-700 transition-colors">
                                {safeString(lesson.tutor_name)}
                              </Link>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              lesson.status === 'complete' ? 'bg-[#E8F8ED] text-[#2A9147]' :
                              lesson.status === 'cancelled' || lesson.status === 'cancelled-chargeable' ? 'bg-[#FCE8F0] text-[#AE255B]' :
                              'bg-[#FEF4E8] text-[#C77A26]'
                            }`}>
                              {safeString(lesson.status || lesson.attendance_status)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-neutral-500">No lessons found</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'communications' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Communications</h3>
            <p className="text-neutral-500">Communication history coming soon...</p>
          </div>
        </div>
      )}
          </EntityDetailPage>
  );
}

