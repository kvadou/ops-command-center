import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../../../utils/formatters';
import {
  CalendarDaysIcon,
  UserGroupIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  XMarkIcon,
  BriefcaseIcon,
  ClockIcon,
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  CurrencyDollarIcon,
  AcademicCapIcon
} from '@heroicons/react/24/outline';

export default function SchoolScheduleTab({ school }) {
  const [jobs, setJobs] = useState(school.jobs || []);
  const [filteredJobs, setFilteredJobs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('all');
  const [terms, setTerms] = useState([]);

  // Modal state
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobLessons, setJobLessons] = useState([]);
  const [loadingLessons, setLoadingLessons] = useState(false);

  // Lesson detail view state
  const [selectedLesson, setSelectedLesson] = useState(null);

  useEffect(() => {
    // Extract unique terms from jobs
    const uniqueTerms = [...new Set(jobs.map(j => j.termSeason).filter(Boolean))];
    setTerms(uniqueTerms.sort().reverse());
  }, [jobs]);

  useEffect(() => {
    let filtered = [...jobs];

    // Filter by search term
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(job =>
        job.serviceName?.toLowerCase().includes(search) ||
        job.tutorNames?.toLowerCase().includes(search)
      );
    }

    // Filter by term
    if (selectedTerm !== 'all') {
      filtered = filtered.filter(job => job.termSeason === selectedTerm);
    }

    // Sort by most recent first
    filtered.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    setFilteredJobs(filtered);
  }, [jobs, searchTerm, selectedTerm]);


  const getStatusBadge = (status, isFinished) => {
    if (isFinished) {
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800">Finished</span>;
    }
    const statusStyles = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-blue-100 text-blue-800',
      active: 'bg-green-100 text-green-800',
      complete: 'bg-neutral-100 text-neutral-800'
    };
    const style = statusStyles[status] || 'bg-neutral-100 text-neutral-800';
    return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>{status || 'Unknown'}</span>;
  };

  // Open job modal and fetch lessons
  const openJobModal = async (job) => {
    setSelectedJob(job);
    setLoadingLessons(true);
    setJobLessons([]);

    try {
      const response = await fetch(`/api/schools/service/${job.serviceId}/lessons`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        // Sort lessons: future first (ascending by date), then past (also ascending)
        const now = new Date();
        const sorted = (data.lessons || []).sort((a, b) => {
          const dateA = new Date(a.start);
          const dateB = new Date(b.start);
          const aIsFuture = dateA >= now;
          const bIsFuture = dateB >= now;

          // Future lessons come first
          if (aIsFuture && !bIsFuture) return -1;
          if (!aIsFuture && bIsFuture) return 1;

          // Within same category, sort ascending (earliest first)
          return dateA - dateB;
        });
        setJobLessons(sorted);
      }
    } catch (err) {
      console.error('Error fetching lessons:', err);
    } finally {
      setLoadingLessons(false);
    }
  };

  const closeJobModal = () => {
    setSelectedJob(null);
    setJobLessons([]);
    setSelectedLesson(null);
  };

  // Lesson detail handlers
  const openLessonDetail = (lesson) => {
    setSelectedLesson(lesson);
  };

  const closeLessonDetail = () => {
    setSelectedLesson(null);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  // Extract simplified job name (just day/time portion since school name is redundant)
  const getSimplifiedJobName = (fullName) => {
    if (!fullName) return 'Unnamed Job';
    // Job names follow pattern: "School Name // Subject // Term // Day Time"
    const parts = fullName.split(' // ');
    if (parts.length >= 4) {
      // Return just the day/time (last part)
      return parts[parts.length - 1];
    } else if (parts.length === 3) {
      // Return last part
      return parts[2];
    } else if (parts.length === 2) {
      return parts[1];
    }
    return fullName;
  };

  const getLessonStatusColor = (status, start) => {
    const isPast = new Date(start) < new Date();
    if (status === 'cancelled') return 'bg-red-50 border-red-200 text-red-700';
    if (isPast) return 'bg-neutral-50 border-neutral-200 text-neutral-600';
    return 'bg-green-50 border-green-200 text-green-700';
  };

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-neutral-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search jobs..."
              className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
            />
          </div>

          {/* Term Filter */}
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-5 w-5 text-neutral-400" />
            <select
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
            >
              <option value="all">All Terms</option>
              {terms.map(term => (
                <option key={term} value={term}>{term}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
        {filteredJobs.length === 0 ? (
          <div className="p-8 text-center">
            <CalendarDaysIcon className="mx-auto h-12 w-12 text-neutral-400" />
            <h3 className="mt-2 text-sm font-medium text-neutral-900">No jobs found</h3>
            <p className="mt-1 text-sm text-neutral-500">
              {searchTerm || selectedTerm !== 'all'
                ? 'Try adjusting your filters'
                : 'No jobs have been created for this school yet'
              }
            </p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Schedule</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Term</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Tutor</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider">Students</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">Revenue</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-neutral-200">
                {filteredJobs.map((job, index) => (
                  <tr key={job.serviceId || index} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openJobModal(job)}
                        className="text-sm font-medium text-brand-purple hover:text-brand-navy hover:underline text-left"
                        title={job.serviceName}
                      >
                        {getSimplifiedJobName(job.serviceName)}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-sm text-neutral-500 whitespace-nowrap">
                      {job.termSeason || 'N/A'}
                    </td>
                    <td className="px-3 py-3 text-sm text-neutral-500 max-w-[120px] truncate" title={job.tutorNames}>
                      {job.tutorNames || 'Unassigned'}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-1 text-sm text-neutral-500">
                        <UserGroupIcon className="h-4 w-4" />
                        {job.enrollmentCount || job.studentCount || 0}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-neutral-900 font-medium text-right whitespace-nowrap">
                      {formatCurrency(job.revenue)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {getStatusBadge(job.serviceStatus, job.isFinished)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 text-center">
          <p className="text-sm text-neutral-500">Total Jobs</p>
          <p className="text-2xl font-bold text-neutral-900">{jobs.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 text-center">
          <p className="text-sm text-neutral-500">Active Jobs</p>
          <p className="text-2xl font-bold text-green-600">
            {jobs.filter(j => !j.isFinished).length}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 text-center">
          <p className="text-sm text-neutral-500">Total Revenue</p>
          <p className="text-2xl font-bold text-neutral-900">
            {formatCurrency(jobs.reduce((sum, j) => sum + (parseFloat(j.revenue) || 0), 0))}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 text-center">
          <p className="text-sm text-neutral-500">Total Students</p>
          <p className="text-2xl font-bold text-neutral-900">
            {jobs.reduce((sum, j) => sum + (j.enrollmentCount || j.studentCount || 0), 0)}
          </p>
        </div>
      </div>

      {/* Job Detail Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/50 transition-opacity"
              onClick={closeJobModal}
            />

            {/* Modal Content */}
            <div className="relative bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
              {/* Modal Header */}
              <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
                  <BriefcaseIcon className="h-5 w-5 text-brand-purple" />
                  {selectedJob.serviceName || 'Job Details'}
                </h2>
                <button
                  onClick={closeJobModal}
                  className="p-2 hover:bg-neutral-100 rounded-full transition-colors"
                >
                  <XMarkIcon className="h-5 w-5 text-neutral-500" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="overflow-y-auto max-h-[calc(90vh-80px)] p-6 space-y-6">
                {/* Job Details Card */}
                <div className="bg-brand-light/30 rounded-xl p-6 border border-brand-cyan/20">
                  <div className="flex items-center gap-2 mb-4">
                    <BriefcaseIcon className="h-5 w-5 text-brand-navy" />
                    <h3 className="font-semibold text-neutral-900">Job Details</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {/* Left Column */}
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-neutral-500">Default Charge Rate</p>
                        <p className="text-lg font-semibold text-neutral-900">
                          {formatCurrency(selectedJob.chargeRate || selectedJob.dftChargeRate || 0)} per lesson
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-neutral-500">Default Tutor Rate</p>
                        <p className="text-lg font-semibold text-neutral-900">
                          {formatCurrency(selectedJob.tutorRate || selectedJob.dftContractorRate || 0)} per lesson
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-neutral-500">Total Hours</p>
                        <p className="text-lg font-semibold text-neutral-900">
                          {(selectedJob.totalHours || selectedJob.units || 0).toFixed(1)}
                        </p>
                      </div>
                    </div>

                    {/* Middle Column */}
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-neutral-500">Job ID</p>
                        <p className="text-lg font-semibold text-neutral-900">{selectedJob.serviceId}</p>
                      </div>
                      <div>
                        <p className="text-sm text-neutral-500">Status</p>
                        <div className="mt-1">
                          {getStatusBadge(selectedJob.serviceStatus, selectedJob.isFinished)}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-neutral-500">Term</p>
                        <p className="text-lg font-semibold text-neutral-900">
                          {selectedJob.termSeason || 'N/A'}
                        </p>
                      </div>
                    </div>

                    {/* Right Column - Labels */}
                    <div>
                      <p className="text-sm text-neutral-500 mb-2">Labels</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedJob.isFinished && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                            Job Finished
                          </span>
                        )}
                        {selectedJob.labels?.map((label, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-brand-orange/20 text-brand-orange"
                          >
                            {typeof label === 'string' ? label : label.name}
                          </span>
                        ))}
                        {!selectedJob.isFinished && (!selectedJob.labels || selectedJob.labels.length === 0) && (
                          <span className="text-sm text-neutral-400">No labels</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Lessons Section - conditionally show list or detail */}
                {selectedLesson ? (
                  /* Lesson Detail View */
                  <div>
                    {/* Back button */}
                    <button
                      onClick={closeLessonDetail}
                      className="flex items-center gap-2 text-brand-purple hover:text-brand-navy mb-4 font-medium"
                    >
                      <ArrowLeftIcon className="h-4 w-4" />
                      Back to Lessons
                    </button>

                    {/* Lesson Header */}
                    <div className="bg-brand-light/30 rounded-xl p-6 border border-brand-cyan/20 mb-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="font-semibold text-neutral-900 text-lg">
                            {formatDate(selectedLesson.start)}
                          </h3>
                          <p className="text-neutral-600">
                            {formatTime(selectedLesson.start)} - {formatTime(selectedLesson.finish)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-brand-green">
                            {formatCurrency(selectedLesson.revenue || 0)}
                          </p>
                          <p className="text-sm text-neutral-500">Total Revenue</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-brand-cyan/20">
                        <div>
                          <p className="text-sm text-neutral-500">Lesson ID</p>
                          <a
                            href={`https://account.acmeops.com/cal/appointments/${selectedLesson.appointmentId}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-brand-purple hover:underline flex items-center gap-1"
                          >
                            {selectedLesson.appointmentId}
                            <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                          </a>
                        </div>
                        <div>
                          <p className="text-sm text-neutral-500">Status</p>
                          <p className="font-medium capitalize">{selectedLesson.status}</p>
                        </div>
                        <div>
                          <p className="text-sm text-neutral-500">Duration</p>
                          <p className="font-medium">{selectedLesson.units || 1} hour(s)</p>
                        </div>
                        <div>
                          <p className="text-sm text-neutral-500">Tutor(s)</p>
                          <p className="font-medium">
                            {selectedLesson.tutors?.map(t => t.contractor_name || t.name).join(', ') || 'No tutor'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Students Section */}
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <AcademicCapIcon className="h-5 w-5 text-brand-purple" />
                        <h3 className="font-semibold text-neutral-900">
                          Students ({selectedLesson.students?.length || 0})
                        </h3>
                      </div>

                      {!selectedLesson.students || selectedLesson.students.length === 0 ? (
                        <div className="text-center py-8 text-neutral-500 bg-neutral-50 rounded-lg">
                          No students enrolled in this lesson
                        </div>
                      ) : (
                        <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                          <table className="min-w-full divide-y divide-neutral-200">
                            <thead className="bg-neutral-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Student</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">ID</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase">Rate/Lesson</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-neutral-500 uppercase">Status</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-neutral-500 uppercase">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-200">
                              {selectedLesson.students.map((student, idx) => (
                                <tr key={student.student_id || idx} className="hover:bg-neutral-50">
                                  <td className="px-4 py-3">
                                    <p className="font-medium text-neutral-900">
                                      {student.student_name || student.name || 'Unknown'}
                                    </p>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-neutral-600">
                                    {student.student_id || '-'}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <span className="font-medium text-brand-green">
                                      {formatCurrency(student.charge_rate || 0)}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                      student.status === 'attended' ? 'bg-green-100 text-green-800' :
                                      student.status === 'missed' ? 'bg-red-100 text-red-800' :
                                      'bg-neutral-100 text-neutral-800'
                                    }`}>
                                      {student.status || 'enrolled'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      {student.student_id && (
                                        <a
                                          href={`https://account.acmeops.com/recipients/${student.student_id}/`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-brand-purple hover:text-brand-navy text-sm flex items-center gap-1"
                                          title="View student in TutorCruncher"
                                        >
                                          Student
                                          <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                                        </a>
                                      )}
                                      {student.paying_client_id && (
                                        <a
                                          href={`https://account.acmeops.com/clients/${student.paying_client_id}/`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-brand-orange hover:text-brand-pink text-sm flex items-center gap-1"
                                          title="View billing client in TutorCruncher"
                                        >
                                          Billing
                                          <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                                        </a>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>

                          {/* Student totals */}
                          <div className="bg-neutral-50 px-4 py-3 border-t border-neutral-200">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-medium text-neutral-700">
                                Total from {selectedLesson.students.length} student(s)
                              </span>
                              <span className="font-bold text-brand-green">
                                {formatCurrency(selectedLesson.students.reduce((sum, s) => sum + (parseFloat(s.charge_rate) || 0), 0))}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Lessons List */
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <ClockIcon className="h-5 w-5 text-brand-purple" />
                      <h3 className="font-semibold text-neutral-900">
                        Lessons ({jobLessons.length})
                      </h3>
                    </div>

                    {loadingLessons ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple"></div>
                      </div>
                    ) : jobLessons.length === 0 ? (
                      <div className="text-center py-8 text-neutral-500">
                        No lessons found for this job
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {jobLessons.map((lesson, idx) => {
                          const isPast = new Date(lesson.start) < new Date();
                          return (
                            <button
                              key={lesson.appointmentId || idx}
                              onClick={() => openLessonDetail(lesson)}
                              className={`w-full text-left p-4 rounded-lg border ${getLessonStatusColor(lesson.status, lesson.start)} hover:shadow-md transition-shadow cursor-pointer`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div>
                                    <p className="font-medium">
                                      {formatDate(lesson.start)}
                                    </p>
                                    <p className="text-sm opacity-75">
                                      {formatTime(lesson.start)} - {formatTime(lesson.finish)}
                                    </p>
                                  </div>
                                  {isPast ? (
                                    <span className="text-xs px-2 py-1 bg-neutral-200 text-neutral-600 rounded">Past</span>
                                  ) : (
                                    <span className="text-xs px-2 py-1 bg-green-200 text-green-700 rounded">Upcoming</span>
                                  )}
                                </div>
                                <div className="text-right">
                                  <p className="font-medium">{formatCurrency(lesson.revenue || 0)}</p>
                                  <p className="text-sm opacity-75">
                                    {lesson.tutors?.map(t => t.contractor_name || t.name).join(', ') || 'No tutor'}
                                  </p>
                                </div>
                              </div>
                              {lesson.students && lesson.students.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-current/10 flex items-center justify-between">
                                  <p className="text-sm opacity-75">
                                    <span className="font-medium">{lesson.students.length} student(s):</span>{' '}
                                    {lesson.students.map(s => s.student_name || s.name).join(', ')}
                                  </p>
                                  <span className="text-xs text-brand-purple font-medium">Click for details →</span>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
