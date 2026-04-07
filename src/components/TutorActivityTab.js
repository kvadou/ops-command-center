import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { PlusIcon } from '@heroicons/react/24/outline';
import AdHocChargeModal from './AdHocChargeModal';

export default function TutorActivityTab({ tutorId, tutor, relatedServices, relatedLessons, adhocCharges }) {
  const [isAdHocModalOpen, setIsAdHocModalOpen] = useState(false);

  // Calculate job stats
  const openJobs = relatedServices?.filter(s => s.status === 'in_progress' || s.status === 'active') || [];
  const totalJobs = relatedServices?.length || 0;

  // Calculate total hours worked from lessons
  const totalHours = relatedLessons?.reduce((sum, lesson) => {
    if (lesson.status === 'complete' && lesson.units) {
      return sum + parseFloat(lesson.units);
    }
    return sum;
  }, 0) || 0;

  // Get unique students from lessons
  const students = new Set();
  relatedLessons?.forEach(lesson => {
    if (lesson.recipient_name) {
      students.add(lesson.recipient_name);
    }
  });

  // Get unique clients from lessons
  const clients = new Set();
  relatedLessons?.forEach(lesson => {
    if (lesson.client_name) {
      clients.add(lesson.client_name);
    }
  });

  const handleAddAdHocCharge = () => {
    setIsAdHocModalOpen(true);
  };

  const handleSaveAdHocCharge = () => {
    setIsAdHocModalOpen(false);
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      {/* Jobs Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-neutral-900">Jobs</h3>
          <Link 
            to={`/jobs?tutor=${tutorId}`}
            className="text-sm text-brand-purple hover:text-brand-navy font-medium"
          >
            + Add to/Create new job
          </Link>
        </div>
        <div className="mb-4 text-sm text-neutral-600">
          <span className="font-medium">Open jobs: {openJobs.length}</span>
          <span className="mx-2">•</span>
          <span className="font-medium">Total jobs: {totalJobs}</span>
        </div>
        {relatedServices && relatedServices.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Date Created</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Total hours worked:</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Students</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Clients</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-neutral-200">
                  {relatedServices.slice(0, 10).map((service) => {
                    const serviceLessons = relatedLessons?.filter(l => l.service_id === service.service_id) || [];
                    const serviceStudents = new Set();
                    const serviceClients = new Set();
                    serviceLessons.forEach(lesson => {
                      if (lesson.recipient_name) serviceStudents.add(lesson.recipient_name);
                      if (lesson.client_name) serviceClients.add(lesson.client_name);
                    });
                    const serviceHours = serviceLessons.reduce((sum, l) => {
                      if (l.status === 'complete' && l.units) return sum + parseFloat(l.units);
                      return sum;
                    }, 0);

                    return (
                      <tr key={service.service_id} className="hover:bg-neutral-50">
                        <td className="px-4 py-3 text-sm">
                          <Link to={`/jobs/${service.service_id}`} className="text-brand-purple hover:text-brand-navy font-medium">
                            {service.name || `Job ${service.service_id}`}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-500">
                          {service.created_at ? new Date(service.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-500">
                          {serviceHours.toFixed(1)} hours
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-500">
                          {Array.from(serviceStudents).join(', ') || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-500">
                          {Array.from(serviceClients).join(', ') || '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            service.status === 'in_progress' || service.status === 'active' 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-neutral-100 text-neutral-800'
                          }`}>
                            {service.status || 'Unknown'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {relatedServices.length > 10 && (
              <div className="mt-4">
                <Link 
                  to={`/jobs?tutor=${tutorId}`}
                  className="text-sm text-brand-purple hover:text-brand-navy font-medium"
                >
                  Show all jobs
                </Link>
              </div>
            )}
          </>
        ) : (
          <p className="text-neutral-500">No jobs found</p>
        )}
      </div>

      {/* Job Applications Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">Job Applications</h3>
        <div className="mb-4 text-sm text-neutral-600">
          <span className="font-medium">Total Applications: 0</span>
          <span className="mx-2">•</span>
          <span className="font-medium">Rejected Applications: 0</span>
          <span className="mx-2">•</span>
          <span className="font-medium">Accepted Applications: 0</span>
          <span className="mx-2">•</span>
          <span className="font-medium">Withdrawn Applications: 0</span>
        </div>
        <p className="text-neutral-500 text-sm">No job applications data available yet.</p>
      </div>

      {/* Ad Hoc Charges Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-neutral-900">Ad Hoc Charges</h3>
          <button
            onClick={handleAddAdHocCharge}
            className="flex items-center gap-1 text-sm text-brand-purple hover:text-brand-navy font-medium"
          >
            <PlusIcon className="h-4 w-4" />
            Add
          </button>
        </div>
        {adhocCharges && adhocCharges.length > 0 ? (
          <>
            <div className="space-y-2">
              {adhocCharges.slice(0, 5).map((charge) => (
                <div key={charge.id} className="p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50">
                  <Link 
                    to={`/ad-hoc-charges?charge=${charge.id}`}
                    className="text-brand-purple hover:text-brand-navy font-medium"
                  >
                    {charge.description || charge.category_name || `Charge ${charge.id}`}
                  </Link>
                  {charge.pay_contractor && (
                    <div className="text-sm text-neutral-500 mt-1">
                      Pay: ${parseFloat(charge.pay_contractor).toFixed(2)}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {adhocCharges.length > 5 && (
              <div className="mt-4">
                <Link 
                  to={`/ad-hoc-charges?tutor=${tutorId}`}
                  className="text-sm text-brand-purple hover:text-brand-navy font-medium"
                >
                  Show all Ad Hoc Charges
                </Link>
              </div>
            )}
          </>
        ) : (
          <p className="text-neutral-500">No Ad Hoc Charges</p>
        )}
      </div>

      {/* Tasks Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-neutral-900">Tasks</h3>
          <Link 
            to={`/tasks?assignee=${tutorId}`}
            className="flex items-center gap-1 text-sm text-brand-purple hover:text-brand-navy font-medium"
          >
            <PlusIcon className="h-4 w-4" />
            Add
          </Link>
        </div>
        <p className="text-neutral-500">No Tasks</p>
      </div>

      {/* Activity Feed Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">Activity Feed</h3>
        <div className="space-y-3">
          {relatedLessons && relatedLessons.length > 0 ? (
            relatedLessons.slice(0, 10).map((lesson) => {
              const startDate = new Date(lesson.start);
              return (
                <div key={lesson.appointment_id} className="flex items-start justify-between py-2 border-b border-neutral-100 last:border-0">
                  <div className="flex-1">
                    <span className="text-sm font-medium text-neutral-900">
                      {tutor?.first_name || 'Tutor'} {tutor?.last_name || ''}
                    </span>
                    <span className="text-sm text-neutral-600 ml-1">
                      • {lesson.status === 'complete' ? 'Marked a Lesson as complete' : `Updated lesson`}
                    </span>
                  </div>
                  <div className="text-sm text-neutral-500">
                    {startDate.toLocaleDateString()} {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-neutral-500 text-sm">No recent activity</p>
          )}
        </div>
        {relatedLessons && relatedLessons.length > 10 && (
          <div className="mt-4">
            <Link 
              to={`/tutors/${tutorId}?tab=activity`}
              className="text-sm text-brand-purple hover:text-brand-navy font-medium"
            >
              Show all activity
            </Link>
          </div>
        )}
      </div>

      <AdHocChargeModal
        open={isAdHocModalOpen}
        onClose={() => setIsAdHocModalOpen(false)}
        onSave={handleSaveAdHocCharge}
        defaultContractorId={tutorId}
      />
    </div>
  );
}

