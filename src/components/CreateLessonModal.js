import { useState, useEffect, useCallback, useRef } from 'react';
import { XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import SearchableSelect from './SearchableSelect';

const DURATION_OPTIONS = [
  { label: '30 minutes', value: 30 },
  { label: '45 minutes', value: 45 },
  { label: '1 hour', value: 60 },
  { label: '1.5 hours', value: 90 },
  { label: '2 hours', value: 120 },
];

const LOCATION_OPTIONS = ['Home', 'Online', 'School', 'Club'];

function formatDateTimeLocal(date) {
  if (!date) return '';
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addMinutes(dateStr, minutes) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

function detectLocation(labels) {
  if (!Array.isArray(labels)) return '';
  for (const label of labels) {
    const lower = (label.name || label || '').toLowerCase();
    if (lower.includes('online')) return 'Online';
    if (lower.includes('home')) return 'Home';
    if (lower.includes('club')) return 'Club';
    if (lower.includes('school')) return 'School';
  }
  return '';
}

export default function CreateLessonModal({
  isOpen,
  onClose,
  defaultStart = null,
  defaultEnd = null,
  onLessonCreated,
}) {
  // Form state
  const [selectedJob, setSelectedJob] = useState(null);
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState(60);
  const [topic, setTopic] = useState('');
  const [location, setLocation] = useState('');
  const [students, setStudents] = useState([]);
  const [tutors, setTutors] = useState([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());
  const [selectedTutorIds, setSelectedTutorIds] = useState(new Set());

  // UI state
  const [loading, setLoading] = useState(false);
  const [jobLoading, setJobLoading] = useState(false);
  const [error, setError] = useState('');
  const [conflicts, setConflicts] = useState([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  const conflictTimeoutRef = useRef(null);

  // Initialize start time from props
  useEffect(() => {
    if (isOpen) {
      if (defaultStart) {
        setStartTime(formatDateTimeLocal(defaultStart));
        // If both start and end provided, calculate duration
        if (defaultEnd) {
          const diffMs = new Date(defaultEnd) - new Date(defaultStart);
          const diffMin = Math.round(diffMs / 60000);
          const closest = DURATION_OPTIONS.reduce((prev, curr) =>
            Math.abs(curr.value - diffMin) < Math.abs(prev.value - diffMin) ? curr : prev
          );
          setDuration(closest.value);
        }
      }
    }
  }, [isOpen, defaultStart, defaultEnd]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedJob(null);
      setStartTime('');
      setDuration(60);
      setTopic('');
      setLocation('');
      setStudents([]);
      setTutors([]);
      setSelectedStudentIds(new Set());
      setSelectedTutorIds(new Set());
      setError('');
      setConflicts([]);
      setLoading(false);
      setJobLoading(false);
    }
  }, [isOpen]);

  // Cleanup conflict timeout on unmount
  useEffect(() => {
    return () => {
      if (conflictTimeoutRef.current) {
        clearTimeout(conflictTimeoutRef.current);
      }
    };
  }, []);

  // Fetch job details when job selected
  const handleJobSelect = useCallback(async (jobId) => {
    if (!jobId) {
      setSelectedJob(null);
      setTopic('');
      setLocation('');
      setStudents([]);
      setTutors([]);
      setSelectedStudentIds(new Set());
      setSelectedTutorIds(new Set());
      return;
    }

    setJobLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/entity-details/jobs/${jobId}`);
      if (!response.ok) throw new Error('Failed to load job details');
      const data = await response.json();

      setSelectedJob({ id: jobId, ...data.service });
      setTopic(data.service?.name || '');
      setLocation(detectLocation(data.service?.labels));

      const jobStudents = (data.relatedStudents || []).map(s => ({
        recipient_id: s.recipient_id,
        name: s.recipient_name || `Student ${s.recipient_id}`,
        charge_rate: s.charge_rate || null,
      }));
      setStudents(jobStudents);
      setSelectedStudentIds(new Set(jobStudents.map(s => s.recipient_id)));

      const jobTutors = (data.relatedTutors || []).map(t => ({
        contractor_id: t.contractor_id,
        name: `${t.first_name || ''} ${t.last_name || ''}`.trim() || `Tutor ${t.contractor_id}`,
        pay_rate: t.pay_rate || null,
      }));
      setTutors(jobTutors);
      setSelectedTutorIds(new Set(jobTutors.map(t => t.contractor_id)));
    } catch (err) {
      setError('Failed to load job details. Please try again.');
    } finally {
      setJobLoading(false);
    }
  }, []);

  // Job search function for SearchableSelect
  const searchJobs = useCallback(async (query) => {
    const response = await fetch(`/api/entity-lists/jobs?search=${encodeURIComponent(query)}&limit=20`);
    if (response.ok) {
      const data = await response.json();
      const jobs = data.data || data.jobs || [];
      return jobs.map(j => ({
        id: j.service_id || j.id,
        serviceId: j.service_id || j.id,
        name: j.name || j.serviceName,
      }));
    }
    return [];
  }, []);

  // Conflict checking
  const checkConflicts = useCallback(() => {
    if (conflictTimeoutRef.current) {
      clearTimeout(conflictTimeoutRef.current);
    }

    if (!startTime || (selectedTutorIds.size === 0 && selectedStudentIds.size === 0)) {
      setConflicts([]);
      return;
    }

    conflictTimeoutRef.current = setTimeout(async () => {
      setCheckingConflicts(true);
      try {
        const start = new Date(startTime).toISOString();
        const end = addMinutes(startTime, duration);
        const tutorIds = Array.from(selectedTutorIds).join(',');
        const studentIds = Array.from(selectedStudentIds).join(',');

        const params = new URLSearchParams({ start, end });
        if (tutorIds) params.set('tutor_ids', tutorIds);
        if (studentIds) params.set('student_ids', studentIds);

        const response = await fetch(`/api/lessons/conflicts?${params}`);
        if (response.ok) {
          const data = await response.json();
          setConflicts(data.conflicts || []);
        }
      } catch {
        // Silently fail conflict checks — non-blocking
      } finally {
        setCheckingConflicts(false);
      }
    }, 500);
  }, [startTime, duration, selectedTutorIds, selectedStudentIds]);

  // Trigger conflict check when relevant fields change
  useEffect(() => {
    if (isOpen) {
      checkConflicts();
    }
  }, [isOpen, checkConflicts]);

  // Toggle helpers
  const toggleStudent = (id) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTutor = (id) => {
    setSelectedTutorIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllStudents = () => {
    if (selectedStudentIds.size === students.length) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(students.map(s => s.recipient_id)));
    }
  };

  const toggleAllTutors = () => {
    if (selectedTutorIds.size === tutors.length) {
      setSelectedTutorIds(new Set());
    } else {
      setSelectedTutorIds(new Set(tutors.map(t => t.contractor_id)));
    }
  };

  // Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!selectedJob) {
      setError('Please select a job.');
      return;
    }
    if (!startTime) {
      setError('Please set a start time.');
      return;
    }
    if (selectedStudentIds.size === 0) {
      setError('Please select at least one student.');
      return;
    }
    if (selectedTutorIds.size === 0) {
      setError('Please select at least one tutor.');
      return;
    }

    setLoading(true);
    try {
      const body = {
        service_id: parseInt(selectedJob.id, 10),
        start: new Date(startTime).toISOString(),
        finish: addMinutes(startTime, duration),
        topic,
        location,
        students: students
          .filter(s => selectedStudentIds.has(s.recipient_id))
          .map(s => ({
            recipient_id: s.recipient_id,
            ...(s.charge_rate ? { charge_rate: s.charge_rate } : {}),
          })),
        tutors: tutors
          .filter(t => selectedTutorIds.has(t.contractor_id))
          .map(t => ({
            contractor_id: t.contractor_id,
            ...(t.pay_rate ? { pay_rate: t.pay_rate } : {}),
          })),
      };

      const response = await fetch('/api/lessons/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || data.message || 'Failed to create lesson');
      }

      onLessonCreated?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create lesson. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Computed finish time display
  const finishTimeDisplay = startTime
    ? new Date(addMinutes(startTime, duration)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '--:--';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
                {/* Header */}
                <div className="bg-gradient-to-r from-brand-navy via-brand-purple to-brand-navy px-6 py-4 flex items-center justify-between rounded-t-xl">
                  <h2 className="text-lg font-semibold text-white">
                    Create Lesson
                  </h2>
                  <button
                    onClick={onClose}
                    className="text-white/80 hover:text-white transition-colors rounded-full p-1"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                  {/* Error */}
                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  {/* Conflict warnings */}
                  {conflicts.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <ExclamationTriangleIcon className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-amber-800">
                          <p className="font-medium mb-1">Scheduling Conflicts Detected</p>
                          <ul className="space-y-1">
                            {conflicts.map((c, i) => (
                              <li key={i}>{c.message || `Conflict with ${c.name || 'existing lesson'}`}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Job search */}
                  <div>
                    <SearchableSelect
                      label="Job / Service"
                      placeholder="Search jobs..."
                      value={selectedJob?.id || ''}
                      onChange={(val) => handleJobSelect(val)}
                      searchFunction={searchJobs}
                      getDisplayValue={(item) => item.name}
                      getItemValue={(item) => item.id}
                      emptyLabel="Select a job"
                      emptyValue=""
                      minSearchLength={2}
                    />
                    {jobLoading && (
                      <p className="text-xs text-neutral-500 mt-1">Loading job details...</p>
                    )}
                  </div>

                  {/* Start time + Duration row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Start Time
                      </label>
                      <input
                        type="datetime-local"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Duration
                        <span className="text-neutral-400 font-normal ml-2">
                          ends at {finishTimeDisplay}
                        </span>
                      </label>
                      <select
                        value={duration}
                        onChange={(e) => setDuration(parseInt(e.target.value, 10))}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
                      >
                        {DURATION_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Topic + Location row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Topic
                      </label>
                      <input
                        type="text"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder="Lesson topic..."
                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Location
                      </label>
                      <select
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
                      >
                        <option value="">Select location</option>
                        {LOCATION_OPTIONS.map(loc => (
                          <option key={loc} value={loc}>{loc}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Students */}
                  {students.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-neutral-700">
                          Students ({selectedStudentIds.size}/{students.length})
                        </label>
                        <button
                          type="button"
                          onClick={toggleAllStudents}
                          className="text-xs text-brand-purple hover:text-brand-navy transition-colors"
                        >
                          {selectedStudentIds.size === students.length ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                      <div className="space-y-2 max-h-32 overflow-y-auto border border-neutral-200 rounded-lg p-3">
                        {students.map(s => (
                          <label key={s.recipient_id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedStudentIds.has(s.recipient_id)}
                              onChange={() => toggleStudent(s.recipient_id)}
                              className="w-4 h-4 text-brand-purple border-neutral-300 rounded focus:ring-brand-purple"
                            />
                            <span className="text-sm text-neutral-700">{s.name}</span>
                            {s.charge_rate && (
                              <span className="text-xs text-neutral-400 ml-auto">${s.charge_rate}/hr</span>
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tutors */}
                  {tutors.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-neutral-700">
                          Tutors ({selectedTutorIds.size}/{tutors.length})
                        </label>
                        <button
                          type="button"
                          onClick={toggleAllTutors}
                          className="text-xs text-brand-purple hover:text-brand-navy transition-colors"
                        >
                          {selectedTutorIds.size === tutors.length ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                      <div className="space-y-2 max-h-32 overflow-y-auto border border-neutral-200 rounded-lg p-3">
                        {tutors.map(t => (
                          <label key={t.contractor_id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedTutorIds.has(t.contractor_id)}
                              onChange={() => toggleTutor(t.contractor_id)}
                              className="w-4 h-4 text-brand-purple border-neutral-300 rounded focus:ring-brand-purple"
                            />
                            <span className="text-sm text-neutral-700">{t.name}</span>
                            {t.pay_rate && (
                              <span className="text-xs text-neutral-400 ml-auto">${t.pay_rate}/hr</span>
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-3 pt-2 border-t border-neutral-200">
                    {checkingConflicts && (
                      <span className="text-xs text-neutral-400 mr-auto">Checking conflicts...</span>
                    )}
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading || jobLoading}
                      className="px-6 py-2 text-sm font-medium text-white bg-brand-purple rounded-lg hover:bg-brand-navy transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Creating...' : 'Create Lesson'}
                    </button>
                  </div>
                </form>
      </div>
    </div>
  );
}
