import React, { useState } from 'react';
import EntityListPage from './EntityListPage';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';

export default function JobApplicationsPage() {
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const getRowData = (application) => ({
    id: application.id,
    description: application.description,
    contractor: application.contractor_name,
    contractorId: application.contractor_id,
    service: application.service_name,
    serviceId: application.service_id,
    status: application.status,
    dateCreated: application.date_created,
    dateUpdated: application.date_updated,
  });

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'accepted':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'pending':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'requested':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'withdrawn':
        return 'bg-neutral-100 text-neutral-800 border-neutral-200';
      default:
        return 'bg-neutral-100 text-neutral-800 border-neutral-200';
    }
  };

  const columns = [
    {
      key: 'description',
      label: 'Description',
      render: (application) => (
        <button
          onClick={() => {
            setSelectedApplication(application);
            setIsModalOpen(true);
          }}
          className="text-left text-sm text-brand-purple hover:text-brand-navy hover:underline"
        >
          {application.description ? (
            application.description.length > 60
              ? `${application.description.substring(0, 60)}...`
              : application.description
          ) : '—'}
        </button>
      ),
    },
    {
      key: 'contractor',
      label: 'Tutor',
      render: (application) => (
        <Link
          to={`/tutors/${application.contractorId}`}
          className="text-sm font-medium text-brand-purple hover:text-brand-navy"
        >
          {application.contractor || '—'}
        </Link>
      ),
      sortable: true
    },
    {
      key: 'service',
      label: 'Job',
      render: (application) => (
        <Link
          to={`/jobs/${application.serviceId}`}
          className="text-sm text-brand-purple hover:text-brand-navy"
        >
          {application.service || '—'}
        </Link>
      ),
      sortable: true
    },
    {
      key: 'dateCreated',
      label: 'Created',
      render: (application) => (
        <div className="text-sm text-neutral-900">
          {application.dateCreated
            ? new Date(application.dateCreated).toLocaleString('en-US', {
                month: '2-digit',
                day: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              })
            : '—'}
        </div>
      ),
      sortable: true
    },
    {
      key: 'status',
      label: 'Status',
      render: (application) => (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(
            application.status
          )}`}
        >
          {application.status ? application.status.charAt(0).toUpperCase() + application.status.slice(1) : '—'}
        </span>
      ),
      sortable: true
    },
  ];

  const tabs = [
    { key: 'all', label: 'All', count: null },
    { key: 'pending', label: 'Pending', count: null, filter: { status: 'pending' } },
    { key: 'requested', label: 'Requested', count: null, filter: { status: 'requested' } },
    { key: 'accepted', label: 'Accepted', count: null, filter: { status: 'accepted' } },
    { key: 'rejected', label: 'Rejected', count: null, filter: { status: 'rejected' } },
    { key: 'withdrawn', label: 'Withdrawn', count: null, filter: { status: 'withdrawn' } },
  ];

  return (
    <>
      <EntityListPage
        title="Job applications"
        entityType="job-application"
        apiEndpoint="job-applications"
        getRowData={getRowData}
        columns={columns}
        searchPlaceholder="Search by description, tutor, or job..."
        filters={[
          {
            key: 'contractor_id',
            label: 'Tutor',
            type: 'select',
            options: [], // Will be populated dynamically
            apiEndpoint: '/api/entity-lists/tutors',
            getOptionLabel: (tutor) => `${tutor.first_name} ${tutor.last_name}`,
            getOptionValue: (tutor) => tutor.contractor_id,
          },
          {
            key: 'service_id',
            label: 'Job',
            type: 'select',
            options: [], // Will be populated dynamically
            apiEndpoint: '/api/entity-lists/jobs',
            getOptionLabel: (job) => job.name,
            getOptionValue: (job) => job.service_id,
          },
        ]}
        tabs={tabs}
        defaultTab="all"
        getEntityLink={(application) => `/job-applications/${application.id}`}
        getEntityName={(application) => `Application from ${application.contractor || 'Unknown'}`}
        getEntitySubtitle={(application) => {
          const parts = [];
          if (application.service) parts.push(`Job: ${application.service}`);
          if (application.dateCreated) {
            parts.push(new Date(application.dateCreated).toLocaleDateString());
          }
          return parts.join(' • ');
        }}
        onTabCountsUpdate={(counts) => {
          // Update tab counts if needed
        }}
      />

      {/* Application Detail Modal */}
      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <DialogTitle className="text-lg font-semibold text-neutral-900 mb-4 flex justify-between items-center">
              Applications
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-full hover:bg-neutral-100"
              >
                <XMarkIcon className="h-5 w-5 text-neutral-500" />
              </button>
            </DialogTitle>

            {selectedApplication && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Job Name:
                    </label>
                    <Link
                      to={`/jobs/${selectedApplication.serviceId}`}
                      className="text-sm text-brand-purple hover:text-brand-navy"
                    >
                      {selectedApplication.service || '—'}
                    </Link>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Application Status:
                    </label>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(
                        selectedApplication.status
                      )}`}
                    >
                      {selectedApplication.status
                        ? selectedApplication.status.charAt(0).toUpperCase() +
                          selectedApplication.status.slice(1)
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Date Applied:
                    </label>
                    <div className="text-sm text-neutral-900">
                      {selectedApplication.dateCreated
                        ? new Date(selectedApplication.dateCreated).toLocaleString('en-US', {
                            month: '2-digit',
                            day: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                          })
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Tutor:
                    </label>
                    <Link
                      to={`/tutors/${selectedApplication.contractorId}`}
                      className="text-sm text-brand-purple hover:text-brand-navy"
                    >
                      {selectedApplication.contractor || '—'}
                    </Link>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Application Description
                  </label>
                  <div className="text-sm text-neutral-900 bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                    {selectedApplication.description || 'No description provided.'}
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-white bg-brand-purple rounded-lg hover:bg-brand-navy transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}

