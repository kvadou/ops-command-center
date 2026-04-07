import React, { useState } from 'react';
import EntityListPage from './EntityListPage';
import { DocumentArrowUpIcon, DocumentArrowDownIcon, TrashIcon } from '@heroicons/react/24/outline';
import DocumentUploadModal from './DocumentUploadModal';
import ConfirmationModal from './ConfirmationModal';
import { useToast } from '../hooks/useToast';

export default function DocumentsPage() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });
  const toast = useToast();

  const getRowData = (doc) => ({
    id: doc.id,
    name: doc.name,
    description: doc.description,
    fileName: doc.file_name,
    fileSize: doc.file_size,
    type: doc.type,
    client: doc.client_name || doc.client,
    tutor: doc.contractor_name || doc.tutor,
    createdAt: doc.date_created || doc.created_at,
  });

  const formatFileSize = (bytes) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const columns = [
    {
      key: 'name',
      label: 'Name',
      render: (doc) => (
        <div className="text-sm font-medium text-neutral-900">
          {doc.name || doc.fileName || '—'}
        </div>
      ),
      sortable: true
    },
    {
      key: 'type',
      label: 'Type',
      render: (doc) => (
        <div className="text-sm text-neutral-900">
          {doc.type || '—'}
        </div>
      ),
      sortable: true
    },
    {
      key: 'client',
      label: 'Client',
      render: (doc) => (
        <div className="text-sm text-neutral-900">
          {doc.client || '—'}
        </div>
      ),
      sortable: true
    },
    {
      key: 'tutor',
      label: 'Tutor',
      render: (doc) => (
        <div className="text-sm text-neutral-900">
          {doc.tutor || '—'}
        </div>
      ),
      sortable: true
    },
    {
      key: 'fileSize',
      label: 'Size',
      render: (doc) => (
        <div className="text-sm text-neutral-900">
          {formatFileSize(doc.fileSize)}
        </div>
      ),
      sortable: true
    },
    {
      key: 'createdAt',
      label: 'Uploaded',
      render: (doc) => (
        <div className="text-sm text-neutral-900">
          {doc.createdAt
            ? new Date(doc.createdAt).toLocaleDateString('en-US', {
                month: '2-digit',
                day: '2-digit',
                year: 'numeric'
              })
            : '—'}
        </div>
      ),
      sortable: true
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (doc) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleDownload(doc)}
            className="p-2 text-brand-purple hover:bg-brand-light rounded-lg transition-colors"
            title="Download"
          >
            <DocumentArrowDownIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => handleDelete(doc)}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      ),
      sortable: false
    },
  ];

  const filters = [
    {
      key: 'type',
      label: 'Type',
      type: 'select',
      options: [
        { value: 'contract', label: 'Contract' },
        { value: 'report', label: 'Report' },
        { value: 'certificate', label: 'Certificate' },
        { value: 'invoice', label: 'Invoice' },
        { value: 'other', label: 'Other' }
      ],
      placeholder: 'All Types'
    },
    {
      key: 'client',
      label: 'Client',
      type: 'text',
      placeholder: 'Search by client name...'
    },
    {
      key: 'tutor',
      label: 'Tutor',
      type: 'text',
      placeholder: 'Search by tutor name...'
    }
  ];

  const handleSave = () => {
    setIsUploadModalOpen(false);
    setRefreshKey(prev => prev + 1);
  };

  const handleDownload = async (doc) => {
    try {
      const response = await fetch(`/api/documents/${doc.id}/download`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.fileName || doc.name || 'document';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        toast.error('Failed to download document');
      }
    } catch (error) {
      console.error('Error downloading document:', error);
      toast.error('Error downloading document');
    }
  };

  const handleDelete = async (doc) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Document',
      message: `Are you sure you want to delete "${doc.name || doc.fileName}"?`,
      action: async () => {
        try {
          const response = await fetch(`/api/documents/${doc.id}`, {
            method: 'DELETE'
          });

          if (response.ok) {
            setRefreshKey(prev => prev + 1);
          } else {
            const errorData = await response.json();
            toast.error(`Failed to delete document: ${errorData.error || 'Unknown error'}`);
          }
        } catch (error) {
          console.error('Error deleting document:', error);
          toast.error('Error deleting document');
        }
      }
    });
  };

  const customHeaderAction = (
    <button
      onClick={() => setIsUploadModalOpen(true)}
      className="px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors text-sm font-medium flex items-center gap-2"
    >
      <DocumentArrowUpIcon className="h-5 w-5" />
      Upload Document
    </button>
  );

  return (
    <>
      <EntityListPage
        key={refreshKey}
        title="Documents"
        apiEndpoint="documents"
        columns={columns}
        filters={filters}
        getRowData={getRowData}
        entityType="documents"
        emptyMessage="No documents found"
        emptyDescription="Upload documents to get started."
        customHeaderAction={customHeaderAction}
      />

      {/* Upload Document Modal */}
      <DocumentUploadModal
        open={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSave={handleSave}
      />

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
        onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
        title={confirmState.title}
        message={confirmState.message}
      />
    </>
  );
}

