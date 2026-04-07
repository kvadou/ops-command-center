import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';



const StatusBadge = ({ status }) => {
  const colors = {
    complete: 'bg-green-100 text-green-800',
    completed: 'bg-green-100 text-green-800',
    planned: 'bg-yellow-100 text-yellow-800',
    cancelled: 'bg-red-100 text-red-800',
    'cancelled-chargeable': 'bg-orange-100 text-orange-800',
    missed: 'bg-red-100 text-red-800',
    attended: 'bg-green-100 text-green-800',
  };
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status] || 'bg-neutral-100 text-neutral-800'}`}>
      {status || 'Unknown'}
    </span>
  );
};

export default function ClubDetailModal({ isOpen, onClose, metricType }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [expandedJobLessons, setExpandedJobLessons] = useState({});

  // Fetch data when modal opens
  useEffect(() => {
    if (!isOpen || !metricType) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setSearchQuery('');
      setExpandedRows(new Set());

      try {
        let endpoint = '';
        switch (metricType) {
          case 'jobs':
            endpoint = '/api/clubs/jobs-detail';
            break;
          case 'lessons':
            endpoint = '/api/clubs/lessons-detail?limit=200';
            break;
          case 'revenue':
            endpoint = '/api/clubs/revenue-detail';
            break;
          case 'students':
            endpoint = '/api/clubs/students-detail';
            break;
          case 'hours':
            endpoint = '/api/clubs/hours-detail';
            break;
          case 'avgRevenue':
            endpoint = '/api/clubs/jobs-detail';
            break;
          default:
            throw new Error(`Unknown metric type: ${metricType}`);
        }

        const response = await fetch(endpoint, { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch data');
        const result = await response.json();
        setData(result);
      } catch (err) {
        console.error('Error fetching detail data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, metricType]);

  // Fetch lessons for expanded job
  const fetchJobLessons = async (serviceId) => {
    if (expandedJobLessons[serviceId]) return; // Already loaded

    try {
      const response = await fetch(`/api/clubs/lessons-detail?service_id=${serviceId}&limit=50`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch lessons');
      const result = await response.json();
      setExpandedJobLessons(prev => ({ ...prev, [serviceId]: result.lessons }));
    } catch (err) {
      console.error('Error fetching job lessons:', err);
    }
  };

  const toggleRowExpanded = (id, serviceId) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
      if (serviceId) fetchJobLessons(serviceId);
    }
    setExpandedRows(newExpanded);
  };

  // Modal titles
  const titles = {
    jobs: 'Jobs Detail',
    lessons: 'Lessons Detail',
    revenue: 'Revenue Breakdown',
    students: 'Students Detail',
    hours: 'Hours Breakdown by Tutor',
    avgRevenue: 'Average Revenue Analysis',
  };

  // Filter data based on search
  const filteredData = useMemo(() => {
    if (!data || !searchQuery) return data;
    const query = searchQuery.toLowerCase();

    if (metricType === 'jobs' || metricType === 'avgRevenue') {
      return { ...data, jobs: data.jobs?.filter(j => j.name?.toLowerCase().includes(query)) };
    }
    if (metricType === 'lessons') {
      return { ...data, lessons: data.lessons?.filter(l =>
        l.serviceName?.toLowerCase().includes(query) ||
        l.tutorNames?.toLowerCase().includes(query) ||
        l.topic?.toLowerCase().includes(query)
      )};
    }
    if (metricType === 'students') {
      return { ...data, students: data.students?.filter(s =>
        s.recipientName?.toLowerCase().includes(query) ||
        s.payingClientName?.toLowerCase().includes(query)
      )};
    }
    if (metricType === 'hours') {
      return { ...data, byTutor: data.byTutor?.filter(t => t.name?.toLowerCase().includes(query)) };
    }
    if (metricType === 'revenue') {
      return { ...data, byJob: data.byJob?.filter(j => j.name?.toLowerCase().includes(query)) };
    }
    return data;
  }, [data, searchQuery, metricType]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-neutral-500 bg-opacity-75 transition-opacity" onClick={onClose} />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-brand-purple to-brand-navy px-6 py-5 rounded-t-2xl flex-shrink-0">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-bold text-white">{titles[metricType] || 'Detail'}</h3>
              <button
                onClick={onClose}
                className="text-white/80 hover:text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="px-6 py-4 border-b border-neutral-200 flex-shrink-0">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
              />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="text-neutral-500">Loading data...</div>
              </div>
            )}

            {error && (
              <div className="text-red-600 py-4">Error: {error}</div>
            )}

            {!loading && !error && filteredData && (
              <>
                {/* Jobs Content */}
                {metricType === 'jobs' && (
                  <div className="space-y-2">
                    <div className="text-sm text-neutral-500 mb-4">
                      {filteredData.jobs?.length || 0} jobs found
                    </div>
                    {filteredData.jobs?.map((job) => (
                      <div key={job.serviceId} className="border border-neutral-200 rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleRowExpanded(job.serviceId, job.serviceId)}
                          className="w-full px-4 py-3 flex items-center justify-between hover:bg-neutral-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {expandedRows.has(job.serviceId) ? (
                              <ChevronDownIcon className="h-5 w-5 text-neutral-400" />
                            ) : (
                              <ChevronRightIcon className="h-5 w-5 text-neutral-400" />
                            )}
                            <span className="font-medium text-neutral-900">{job.name}</span>
                          </div>
                          <div className="flex items-center gap-6 text-sm">
                            <span className="text-neutral-600">{job.lessonCount} lessons</span>
                            <span className="text-neutral-600">{job.studentCount} students</span>
                            <span className="font-medium text-brand-purple">{formatCurrency(job.revenue)}</span>
                            <Link
                              to={`/jobs/${job.serviceId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-brand-purple hover:text-brand-navy"
                            >
                              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                            </Link>
                          </div>
                        </button>

                        {/* Expanded Job Details */}
                        {expandedRows.has(job.serviceId) && (
                          <div className="px-4 py-3 bg-neutral-50 border-t border-neutral-200">
                            <div className="grid grid-cols-4 gap-4 mb-4">
                              <div>
                                <div className="text-xs text-neutral-500">Completed</div>
                                <div className="font-medium">{job.completedLessons}</div>
                              </div>
                              <div>
                                <div className="text-xs text-neutral-500">Upcoming</div>
                                <div className="font-medium">{job.upcomingLessons}</div>
                              </div>
                              <div>
                                <div className="text-xs text-neutral-500">Hours</div>
                                <div className="font-medium">{job.hours.toFixed(1)}</div>
                              </div>
                              <div>
                                <div className="text-xs text-neutral-500">Hourly Rate</div>
                                <div className="font-medium">{formatCurrency(job.hourlyRate)}</div>
                              </div>
                            </div>

                            {/* Lessons for this job */}
                            <div className="mt-4">
                              <div className="text-sm font-medium text-neutral-700 mb-2">Recent Lessons</div>
                              {expandedJobLessons[job.serviceId] ? (
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                  {expandedJobLessons[job.serviceId].slice(0, 10).map((lesson) => (
                                    <div key={lesson.appointmentId} className="flex items-center justify-between text-sm py-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-neutral-600">{formatDate(lesson.start)}</span>
                                        <StatusBadge status={lesson.status} />
                                      </div>
                                      <div className="flex items-center gap-4">
                                        <span className="text-neutral-600">{lesson.tutorNames || '-'}</span>
                                        <span className="font-medium">{formatCurrency(lesson.chargeTotal)}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-neutral-500 text-sm">Loading lessons...</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Lessons Content */}
                {metricType === 'lessons' && (
                  <div className="overflow-x-auto">
                    <div className="text-sm text-neutral-500 mb-4">
                      {filteredData.lessons?.length || 0} lessons found
                    </div>
                    <table className="min-w-full divide-y divide-neutral-200">
                      <thead className="bg-neutral-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Job</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Tutor</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Students</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Status</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase">Revenue</th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-neutral-200">
                        {filteredData.lessons?.slice(0, 100).map((lesson) => (
                          <tr key={lesson.appointmentId} className="hover:bg-neutral-50">
                            <td className="px-4 py-3 text-sm text-neutral-900">{formatDate(lesson.start)}</td>
                            <td className="px-4 py-3 text-sm text-neutral-900">{lesson.serviceName}</td>
                            <td className="px-4 py-3 text-sm text-neutral-600">{lesson.tutorNames || '-'}</td>
                            <td className="px-4 py-3 text-sm text-neutral-600">{lesson.students?.length || 0}</td>
                            <td className="px-4 py-3"><StatusBadge status={lesson.status} /></td>
                            <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(lesson.chargeTotal)}</td>
                            <td className="px-4 py-3">
                              <Link to={`/lessons/${lesson.appointmentId}`} className="text-brand-purple hover:text-brand-navy">
                                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Students Content */}
                {metricType === 'students' && (
                  <div className="overflow-x-auto">
                    <div className="text-sm text-neutral-500 mb-4">
                      {filteredData.students?.length || 0} students found
                    </div>
                    <table className="min-w-full divide-y divide-neutral-200">
                      <thead className="bg-neutral-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Student</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Parent</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Email</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase">Lessons</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase">Missed</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase">Total Paid</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Last Lesson</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-neutral-200">
                        {filteredData.students?.map((student) => (
                          <tr key={student.recipientId} className="hover:bg-neutral-50">
                            <td className="px-4 py-3 text-sm font-medium text-neutral-900">{student.recipientName}</td>
                            <td className="px-4 py-3 text-sm text-neutral-600">{student.payingClientName || '-'}</td>
                            <td className="px-4 py-3 text-sm text-neutral-600">{student.payingClientEmail || '-'}</td>
                            <td className="px-4 py-3 text-sm text-right">{student.lessonCount}</td>
                            <td className="px-4 py-3 text-sm text-right">
                              {student.missedLessons > 0 ? (
                                <span className="text-red-600">{student.missedLessons}</span>
                              ) : (
                                <span className="text-neutral-400">0</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(student.totalPaid)}</td>
                            <td className="px-4 py-3 text-sm text-neutral-600">{formatDate(student.lastLessonDate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Revenue Content */}
                {metricType === 'revenue' && (
                  <div className="space-y-6">
                    <div className="bg-brand-purple/10 rounded-lg p-4">
                      <div className="text-sm text-neutral-600">Total Revenue</div>
                      <div className="text-3xl font-bold text-brand-purple">{formatCurrency(filteredData.total)}</div>
                    </div>

                    <div>
                      <h4 className="font-medium text-neutral-900 mb-3">Revenue by Job</h4>
                      <div className="space-y-2">
                        {filteredData.byJob?.map((job) => (
                          <div key={job.serviceId} className="flex items-center justify-between py-2 border-b border-neutral-100">
                            <span className="text-neutral-900">{job.name}</span>
                            <span className="font-medium">{formatCurrency(job.revenue)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium text-neutral-900 mb-3">Revenue by Month</h4>
                      <div className="space-y-2">
                        {filteredData.byMonth?.slice(0, 12).map((month) => (
                          <div key={month.month} className="flex items-center justify-between py-2 border-b border-neutral-100">
                            <span className="text-neutral-600">{month.month}</span>
                            <span className="font-medium">{formatCurrency(month.revenue)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Hours Content */}
                {metricType === 'hours' && (
                  <div className="space-y-6">
                    <div className="bg-brand-purple/10 rounded-lg p-4">
                      <div className="text-sm text-neutral-600">Total Hours</div>
                      <div className="text-3xl font-bold text-brand-purple">{filteredData.total?.toFixed(1) || 0}</div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-neutral-200">
                        <thead className="bg-neutral-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Tutor</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase">Hours</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase">Lessons</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase">Pay</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase">Revenue</th>
                            <th className="px-4 py-3"></th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-neutral-200">
                          {filteredData.byTutor?.map((tutor) => (
                            <tr key={tutor.contractorId} className="hover:bg-neutral-50">
                              <td className="px-4 py-3 text-sm font-medium text-neutral-900">{tutor.name}</td>
                              <td className="px-4 py-3 text-sm text-right">{tutor.hours.toFixed(1)}</td>
                              <td className="px-4 py-3 text-sm text-right">{tutor.lessonCount}</td>
                              <td className="px-4 py-3 text-sm text-right">{formatCurrency(tutor.totalPay)}</td>
                              <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(tutor.revenueGenerated)}</td>
                              <td className="px-4 py-3">
                                <Link to={`/tutors/${tutor.contractorId}`} className="text-brand-purple hover:text-brand-navy">
                                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Avg Revenue Content */}
                {metricType === 'avgRevenue' && (
                  <div className="space-y-6">
                    {filteredData.jobs && (
                      <>
                        <div className="bg-brand-purple/10 rounded-lg p-4">
                          <div className="text-sm text-neutral-600">Average Revenue per Lesson</div>
                          <div className="text-3xl font-bold text-brand-purple">
                            {formatCurrency(
                              filteredData.jobs.reduce((sum, j) => sum + j.revenue, 0) /
                              Math.max(filteredData.jobs.reduce((sum, j) => sum + j.lessonCount, 0), 1)
                            )}
                          </div>
                        </div>

                        <div>
                          <h4 className="font-medium text-neutral-900 mb-3">Top Revenue per Lesson Jobs</h4>
                          <div className="space-y-2">
                            {filteredData.jobs
                              .filter(j => j.lessonCount > 0)
                              .map(j => ({ ...j, avgRevenue: j.revenue / j.lessonCount }))
                              .sort((a, b) => b.avgRevenue - a.avgRevenue)
                              .slice(0, 10)
                              .map((job) => (
                                <div key={job.serviceId} className="flex items-center justify-between py-2 border-b border-neutral-100">
                                  <span className="text-neutral-900">{job.name}</span>
                                  <div className="flex items-center gap-4">
                                    <span className="text-sm text-neutral-500">{job.lessonCount} lessons</span>
                                    <span className="font-medium">{formatCurrency(job.avgRevenue)}/lesson</span>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-neutral-200 flex-shrink-0 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
