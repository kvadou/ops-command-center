import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DateTime } from 'luxon';
import {
  CheckCircleIcon as CheckCircleSolid,
  XCircleIcon as XCircleSolid,
} from '@heroicons/react/24/solid';
import {
  CheckCircleIcon as CheckCircleOutline,
  CalendarIcon,
  ArrowPathIcon,
  UserGroupIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  UserIcon,
} from '@heroicons/react/24/outline';

const CLUB_ID = 1; // Park Slope

// Toast notification component for error feedback
function Toast({ message, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-6 left-4 right-4 z-toast flex justify-center animate-slide-up">
      <div className="bg-neutral-900 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 max-w-md w-full">
        <ExclamationTriangleIcon className="h-5 w-5 text-accent-orange flex-shrink-0" />
        <span className="text-sm font-medium flex-1">{message}</span>
        <button
          onClick={onDismiss}
          className="text-neutral-400 hover:text-white transition-colors p-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

// Summary pill for the top stats bar
function StatPill({ label, value, colorClass }) {
  return (
    <div className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full ${colorClass}`}>
      <span className="text-lg font-bold leading-none">{value}</span>
      <span className="text-xs font-medium whitespace-nowrap">{label}</span>
    </div>
  );
}

// Attendance toggle button for a single student
function AttendanceToggle({ status, onToggle, disabled }) {
  const baseClasses = 'min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl transition-all duration-200 active:scale-95';

  if (status === 'present') {
    return (
      <button
        onClick={onToggle}
        disabled={disabled}
        className={`${baseClasses} bg-accent-green-light`}
        aria-label="Marked present, tap to mark absent"
      >
        <CheckCircleSolid className="h-8 w-8 text-brand-green" />
      </button>
    );
  }

  if (status === 'missed') {
    return (
      <button
        onClick={onToggle}
        disabled={disabled}
        className={`${baseClasses} bg-accent-pink-light`}
        aria-label="Marked absent, tap to mark present"
      >
        <XCircleSolid className="h-8 w-8 text-brand-pink" />
      </button>
    );
  }

  // Unmarked state
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`${baseClasses} bg-neutral-100 hover:bg-neutral-200`}
      aria-label="Unmarked, tap to mark present"
    >
      <CheckCircleOutline className="h-8 w-8 text-neutral-400" />
    </button>
  );
}

// Single student row within a class card
function StudentRow({ student, onToggle, disabled }) {
  const nextStatus = student.status === 'present' ? 'missed' : 'present';

  return (
    <div className="flex items-center gap-3 py-3 px-4 border-b border-neutral-100 last:border-b-0">
      <AttendanceToggle
        status={student.status}
        onToggle={() => onToggle(student.recipientId, nextStatus)}
        disabled={disabled}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-neutral-900 truncate">
          {student.studentName || student.name}
        </p>
        {student.parentName && (
          <p className="text-xs text-neutral-500 truncate">
            {student.parentName}
          </p>
        )}
      </div>
      {student.chargeRate != null && (
        <span className="flex-shrink-0 text-xs font-medium bg-neutral-100 text-neutral-600 px-2 py-1 rounded-full">
          ${Number(student.chargeRate).toFixed(0)}
        </span>
      )}
    </div>
  );
}

// Status badge for the class card header
function ClassStatusBadge({ status }) {
  const config = {
    complete: { bg: 'bg-accent-green-light', text: 'text-accent-green-dark', label: 'Complete' },
    confirmed: { bg: 'bg-info-light', text: 'text-info-dark', label: 'Confirmed' },
    'checked-in': { bg: 'bg-accent-cyan-light', text: 'text-accent-cyan-dark', label: 'Checked In' },
    'awaiting-report': { bg: 'bg-accent-yellow-light', text: 'text-accent-yellow-dark', label: 'Awaiting Report' },
    cancelled: { bg: 'bg-neutral-100', text: 'text-neutral-500', label: 'Cancelled' },
  };

  const c = config[status] || { bg: 'bg-neutral-100', text: 'text-neutral-600', label: status || 'Scheduled' };

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

// Single class card with header, student list, and footer
function ClassCard({ classData, onToggleStudent, onMarkAllPresent, updatingIds }) {
  const startTime = DateTime.fromISO(classData.startTime || classData.start);
  const endTime = DateTime.fromISO(classData.endTime || classData.finish || classData.end);
  const students = classData.students || [];
  const presentCount = students.filter(s => s.status === 'present').length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
      {/* Card header */}
      <div className="p-4 border-b border-neutral-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <ClockIcon className="h-4 w-4 text-brand-purple flex-shrink-0" />
              <span className="text-sm font-bold text-neutral-900">
                {startTime.isValid ? startTime.toFormat('h:mm a') : '--:--'}
                {' - '}
                {endTime.isValid ? endTime.toFormat('h:mm a') : '--:--'}
              </span>
              <ClassStatusBadge status={classData.status} />
            </div>
            <h3 className="text-base font-semibold text-neutral-900 mt-1 truncate">
              {classData.className || classData.serviceName || classData.jobName || 'Class'}
            </h3>
            {classData.tutorName && (
              <div className="flex items-center gap-1.5 mt-1">
                <UserIcon className="h-3.5 w-3.5 text-neutral-400" />
                <span className="text-xs text-neutral-500">{classData.tutorName}</span>
              </div>
            )}
            {classData.location && (
              <p className="text-xs text-neutral-400 mt-0.5 truncate">{classData.location}</p>
            )}
          </div>
          <button
            onClick={() => onMarkAllPresent(classData.appointmentId)}
            disabled={presentCount === students.length || students.length === 0}
            className="flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center px-3 py-2 bg-brand-green text-white text-xs font-semibold rounded-lg hover:bg-accent-green-dark active:scale-95 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCircleSolid className="h-4 w-4 mr-1" />
            All
          </button>
        </div>
      </div>

      {/* Student roster */}
      {students.length > 0 ? (
        <div>
          {students.map((student) => (
            <StudentRow
              key={student.recipientId}
              student={student}
              onToggle={(recipientId, newStatus) => onToggleStudent(classData.appointmentId, recipientId, newStatus)}
              disabled={updatingIds.has(`${classData.appointmentId}-${student.recipientId}`)}
            />
          ))}
        </div>
      ) : (
        <div className="py-6 text-center text-sm text-neutral-400">
          No students enrolled
        </div>
      )}

      {/* Card footer */}
      <div className="px-4 py-3 bg-neutral-50 border-t border-neutral-100">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-500">
            <UserGroupIcon className="h-4 w-4 inline-block mr-1 -mt-0.5" />
            {presentCount} of {students.length} present
          </span>
          <div className="w-24 h-2 bg-neutral-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-green rounded-full transition-all duration-300"
              style={{ width: students.length > 0 ? `${(presentCount / students.length) * 100}%` : '0%' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Time divider between morning and afternoon
function TimeDivider({ label }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-neutral-200" />
      <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">{label}</span>
      <div className="h-px flex-1 bg-neutral-200" />
    </div>
  );
}

export default function ClubCheckInContent() {
  const [classes, setClasses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingIds, setUpdatingIds] = useState(new Set());
  const abortControllerRef = useRef(null);

  const getHeaders = useCallback(() => {
    return { 'Content-Type': 'application/json' };
  }, []);

  const fetchTodayData = useCallback(async (isRefresh = false) => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const response = await fetch(`/api/clubs/${CLUB_ID}/checkin/today`, {
        credentials: 'include',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to load today's classes (${response.status})`);
      }

      const data = await response.json();
      setClasses(data.classes || []);
      setSummary(data.summary || null);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Failed to load check-in data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getHeaders]);

  // Fetch on mount
  useEffect(() => {
    fetchTodayData();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchTodayData]);

  // Toggle a single student's attendance (optimistic)
  const handleToggleStudent = useCallback(async (appointmentId, recipientId, newStatus) => {
    const updateKey = `${appointmentId}-${recipientId}`;

    // Save previous state for rollback
    const prevClasses = classes;
    const prevSummary = summary;

    // Optimistic update
    setClasses(prev => prev.map(cls => {
      if (cls.appointmentId !== appointmentId) return cls;
      return {
        ...cls,
        students: cls.students.map(s => {
          if (s.recipientId !== recipientId) return s;
          return { ...s, status: newStatus };
        }),
      };
    }));

    // Recompute summary optimistically
    setSummary(prev => {
      if (!prev) return prev;
      const oldStudent = prevClasses
        .find(c => c.appointmentId === appointmentId)
        ?.students?.find(s => s.recipientId === recipientId);
      if (!oldStudent) return prev;

      let checkedIn = prev.checkedIn || 0;
      let absent = prev.absent || 0;

      // Remove old status count
      if (oldStudent.status === 'present') checkedIn--;
      else if (oldStudent.status === 'missed') absent--;

      // Add new status count
      if (newStatus === 'present') checkedIn++;
      else if (newStatus === 'missed') absent++;

      return { ...prev, checkedIn, absent };
    });

    setUpdatingIds(prev => new Set(prev).add(updateKey));

    try {
      const response = await fetch(`/api/clubs/${CLUB_ID}/checkin/${appointmentId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({
          updates: [{ recipientId, status: newStatus }],
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update attendance');
      }

      const data = await response.json();

      // Apply server-confirmed data for this class
      if (data.students) {
        setClasses(prev => prev.map(cls => {
          if (cls.appointmentId !== appointmentId) return cls;
          return { ...cls, students: data.students };
        }));
      }
    } catch (err) {
      // Revert optimistic update
      setClasses(prevClasses);
      setSummary(prevSummary);
      setToastMessage('Could not update attendance. Please try again.');
    } finally {
      setUpdatingIds(prev => {
        const next = new Set(prev);
        next.delete(updateKey);
        return next;
      });
    }
  }, [classes, summary, getHeaders]);

  // Mark all students present in a class (optimistic)
  const handleMarkAllPresent = useCallback(async (appointmentId) => {
    const prevClasses = classes;
    const prevSummary = summary;

    // Optimistic: mark all students in this class as present
    const targetClass = classes.find(c => c.appointmentId === appointmentId);
    if (!targetClass) return;

    const unmarkedCount = targetClass.students.filter(s => s.status !== 'present').length;
    const missedCount = targetClass.students.filter(s => s.status === 'missed').length;

    setClasses(prev => prev.map(cls => {
      if (cls.appointmentId !== appointmentId) return cls;
      return {
        ...cls,
        students: cls.students.map(s => ({ ...s, status: 'present' })),
      };
    }));

    setSummary(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        checkedIn: (prev.checkedIn || 0) + unmarkedCount,
        absent: (prev.absent || 0) - missedCount,
      };
    });

    try {
      const response = await fetch(`/api/clubs/${CLUB_ID}/checkin/${appointmentId}/mark-all`, {
        method: 'PUT',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ status: 'present' }),
      });

      if (!response.ok) {
        throw new Error('Failed to mark all present');
      }

      const data = await response.json();

      if (data.students) {
        setClasses(prev => prev.map(cls => {
          if (cls.appointmentId !== appointmentId) return cls;
          return { ...cls, students: data.students };
        }));
      }
    } catch (err) {
      setClasses(prevClasses);
      setSummary(prevSummary);
      setToastMessage('Could not mark all present. Please try again.');
    }
  }, [classes, summary, getHeaders]);

  // Group classes by morning/afternoon
  const groupedClasses = useCallback(() => {
    if (!classes.length) return { morning: [], afternoon: [], hasBoth: false };

    const morning = [];
    const afternoon = [];

    const sorted = [...classes].sort((a, b) => {
      const aTime = DateTime.fromISO(a.startTime || a.start);
      const bTime = DateTime.fromISO(b.startTime || b.start);
      return aTime.toMillis() - bTime.toMillis();
    });

    for (const cls of sorted) {
      const time = DateTime.fromISO(cls.startTime || cls.start);
      if (time.isValid && time.hour < 12) {
        morning.push(cls);
      } else {
        afternoon.push(cls);
      }
    }

    return {
      morning,
      afternoon,
      hasBoth: morning.length > 0 && afternoon.length > 0,
    };
  }, [classes]);

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-10 h-10 border-4 border-brand-purple/20 border-t-brand-purple rounded-full animate-spin" />
        <p className="text-sm text-neutral-500 font-medium">Loading today's classes...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6">
        <ExclamationTriangleIcon className="h-12 w-12 text-brand-pink" />
        <p className="text-sm text-neutral-700 font-medium text-center">{error}</p>
        <button
          onClick={() => fetchTodayData()}
          className="min-h-[44px] px-6 py-3 bg-brand-purple text-white rounded-lg font-semibold hover:bg-brand-navy active:scale-95 transition-all duration-200"
        >
          Try Again
        </button>
      </div>
    );
  }

  const { morning, afternoon, hasBoth } = groupedClasses();
  const allClasses = [...morning, ...afternoon];
  const today = DateTime.now().setZone('America/New_York');

  return (
    <div className="pb-20">
      {/* Date header */}
      <div className="px-4 pt-4 pb-2">
        <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
          {today.toFormat('EEEE, MMMM d')}
        </p>
      </div>

      {/* Sticky summary bar */}
      <div className="sticky top-0 z-sticky bg-white/95 backdrop-blur-sm border-b border-neutral-100 px-4 py-3">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
          <StatPill
            label="Classes"
            value={summary?.totalClasses ?? allClasses.length}
            colorClass="bg-accent-navy-light text-accent-navy"
          />
          <StatPill
            label="Students"
            value={summary?.totalStudents ?? 0}
            colorClass="bg-primary-50 text-primary-700"
          />
          <StatPill
            label="Present"
            value={summary?.checkedIn ?? 0}
            colorClass="bg-accent-green-light text-accent-green-dark"
          />
          <StatPill
            label="Absent"
            value={summary?.absent ?? 0}
            colorClass="bg-accent-pink-light text-accent-pink-dark"
          />
          <button
            onClick={() => fetchTodayData(true)}
            disabled={refreshing}
            className="flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-neutral-100 hover:bg-neutral-200 active:scale-95 transition-all duration-200 ml-auto"
            aria-label="Refresh"
          >
            <ArrowPathIcon className={`h-5 w-5 text-neutral-600 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Class cards */}
      <div className="px-4 py-4 space-y-4">
        {allClasses.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-20 h-20 rounded-full bg-neutral-100 flex items-center justify-center">
              <CalendarIcon className="h-10 w-10 text-neutral-300" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-semibold text-neutral-700">No classes today</h3>
              <p className="text-sm text-neutral-400 mt-1">
                Check back when classes are scheduled.
              </p>
            </div>
            <button
              onClick={() => fetchTodayData(true)}
              className="min-h-[44px] px-5 py-2.5 bg-brand-purple text-white rounded-lg font-semibold hover:bg-brand-navy active:scale-95 transition-all duration-200"
            >
              Refresh
            </button>
          </div>
        ) : (
          <>
            {hasBoth ? (
              <>
                <TimeDivider label="Morning" />
                {morning.map(cls => (
                  <ClassCard
                    key={cls.appointmentId}
                    classData={cls}
                    onToggleStudent={handleToggleStudent}
                    onMarkAllPresent={handleMarkAllPresent}
                    updatingIds={updatingIds}
                  />
                ))}
                <TimeDivider label="Afternoon" />
                {afternoon.map(cls => (
                  <ClassCard
                    key={cls.appointmentId}
                    classData={cls}
                    onToggleStudent={handleToggleStudent}
                    onMarkAllPresent={handleMarkAllPresent}
                    updatingIds={updatingIds}
                  />
                ))}
              </>
            ) : (
              allClasses.map(cls => (
                <ClassCard
                  key={cls.appointmentId}
                  classData={cls}
                  onToggleStudent={handleToggleStudent}
                  onMarkAllPresent={handleMarkAllPresent}
                  updatingIds={updatingIds}
                />
              ))
            )}
          </>
        )}
      </div>

      {/* Toast notification */}
      {toastMessage && (
        <Toast
          message={toastMessage}
          onDismiss={() => setToastMessage(null)}
        />
      )}
    </div>
  );
}
