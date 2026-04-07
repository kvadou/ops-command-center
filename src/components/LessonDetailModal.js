import React from 'react';
import { XMarkIcon, ClockIcon, CalendarIcon, UserIcon, AcademicCapIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import { safeRender } from '../utils/safeRender';

export default function LessonDetailModal({ lesson, isOpen, onClose }) {
  if (!isOpen || !lesson) return null;

  const safeString = (value) => {
    const rendered = safeRender(value);
    return rendered === null ? '' : String(rendered);
  };

  const startDate = new Date(lesson.start);
  const endDate = new Date(lesson.finish);
  const duration = Math.round((endDate - startDate) / (1000 * 60)); // Duration in minutes

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'complete':
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'planned':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-neutral-100 text-neutral-800 border-neutral-200';
    }
  };

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'complete':
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5" />;
      case 'cancelled':
        return <XCircleIcon className="h-5 w-5" />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-neutral-500 bg-opacity-75 transition-opacity"
        onClick={onClose}
      ></div>

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
        <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-2xl">
          {/* Header */}
          <div className="bg-gradient-to-r from-brand-purple to-brand-navy px-6 py-5 sm:px-8">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-white" id="modal-title">
                  Lesson Details
                </h3>
                <div className="mt-2 flex items-center gap-4 text-white/90">
                  <div className="flex items-center gap-2">
                    <ClockIcon className="h-5 w-5" />
                    <span className="text-lg font-semibold">{formatTime(startDate)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-5 w-5" />
                    <span className="text-sm">{formatDate(startDate)}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-purple transition-colors"
                onClick={onClose}
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="bg-white px-6 py-6 sm:px-8">
            <div className="space-y-6">
              {/* Status Badge */}
              {lesson.status && (
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${getStatusColor(lesson.status)}`}>
                    {getStatusIcon(lesson.status)}
                    {safeString(lesson.status).charAt(0).toUpperCase() + safeString(lesson.status).slice(1)}
                  </span>
                </div>
              )}

              {/* Service Name */}
              {lesson.service_name && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AcademicCapIcon className="h-5 w-5 text-brand-purple" />
                    <h4 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">Service</h4>
                  </div>
                  <div className="pl-7">
                    {lesson.service_id ? (
                      <Link 
                        to={`/jobs/${lesson.service_id}`}
                        className="text-xl font-semibold text-brand-purple hover:text-brand-navy transition-colors"
                      >
                        {safeString(lesson.service_name)}
                      </Link>
                    ) : (
                      <p className="text-xl font-semibold text-neutral-900">{safeString(lesson.service_name)}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Topic */}
              {lesson.topic && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <UserIcon className="h-5 w-5 text-brand-purple" />
                    <h4 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">Topic</h4>
                  </div>
                  <p className="pl-7 text-lg text-neutral-700">{safeString(lesson.topic)}</p>
                </div>
              )}

              {/* Time Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-neutral-200">
                <div>
                  <h4 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-2">Start Time</h4>
                  <p className="text-lg font-medium text-neutral-900">{formatTime(startDate)}</p>
                  <p className="text-sm text-neutral-500">{formatDate(startDate)}</p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-2">End Time</h4>
                  <p className="text-lg font-medium text-neutral-900">{formatTime(endDate)}</p>
                  <p className="text-sm text-neutral-500">Duration: {duration} minutes</p>
                </div>
              </div>

              {/* Additional Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-neutral-200">
                {lesson.charge_type && (
                  <div>
                    <h4 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-2">Charge Type</h4>
                    <p className="text-base text-neutral-700">{safeString(lesson.charge_type)}</p>
                  </div>
                )}
                {lesson.units && (
                  <div>
                    <h4 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-2">Units</h4>
                    <p className="text-base text-neutral-700">{safeString(lesson.units)}</p>
                  </div>
                )}
              </div>

              {/* View Full Details Link */}
              <div className="pt-4 border-t border-neutral-200">
                <Link
                  to={`/lessons/${lesson.appointment_id}`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors font-medium"
                  onClick={onClose}
                >
                  View Full Lesson Details
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


