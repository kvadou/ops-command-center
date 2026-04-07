import React, { useState } from 'react';
import EntityListPage from './EntityListPage';
import { Link } from 'react-router-dom';
import BroadcastModal from './BroadcastModal';
import BroadcastDetailModal from './BroadcastDetailModal';

export default function BroadcastsPage() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedBroadcast, setSelectedBroadcast] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [editingBroadcast, setEditingBroadcast] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const getRowData = (broadcast) => ({
    id: broadcast.id,
    subject: broadcast.subject,
    dateCreated: broadcast.date_created || broadcast.created_at,
    lastSent: broadcast.last_sent,
    recipientCount: broadcast.recipient_count || 0,
    status: broadcast.status,
    emailStyle: broadcast.email_style,
  });

  const columns = [
    {
      key: 'subject',
      label: 'Subject',
      render: (broadcast) => (
        <button
          onClick={() => {
            setSelectedBroadcast(broadcast);
            setIsDetailModalOpen(true);
          }}
          className="text-left text-sm font-medium text-brand-purple hover:text-brand-navy hover:underline"
        >
          {broadcast.subject || '—'}
        </button>
      ),
      sortable: true
    },
    {
      key: 'dateCreated',
      label: 'Date Created',
      render: (broadcast) => (
        <div className="text-sm text-neutral-900">
          {broadcast.dateCreated
            ? new Date(broadcast.dateCreated).toLocaleDateString('en-US', {
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
      key: 'lastSent',
      label: 'Last Sent',
      render: (broadcast) => (
        <div className="text-sm text-neutral-900">
          {broadcast.lastSent
            ? new Date(broadcast.lastSent).toLocaleString('en-US', {
                month: '2-digit',
                day: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              })
            : 'Never'}
        </div>
      ),
      sortable: true
    },
  ];

  const filters = [
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { value: 'draft', label: 'Draft' },
        { value: 'sent', label: 'Sent' },
        { value: 'scheduled', label: 'Scheduled' }
      ],
      placeholder: 'All Statuses'
    },
    {
      key: 'search',
      label: 'Search',
      type: 'text',
      placeholder: 'Search by subject...'
    }
  ];

  const handleSave = () => {
    setIsAddModalOpen(false);
    setEditingBroadcast(null);
    setRefreshKey(prev => prev + 1);
  };

  const handleEdit = (broadcast) => {
    setEditingBroadcast(broadcast);
    setIsAddModalOpen(true);
  };

  const customHeaderAction = (
    <button
      onClick={() => {
        setEditingBroadcast(null);
        setIsAddModalOpen(true);
      }}
      className="px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors text-sm font-medium"
    >
      New Broadcast
    </button>
  );

  return (
    <>
      <EntityListPage
        key={refreshKey}
        title="Broadcasts"
        apiEndpoint="broadcasts"
        columns={columns}
        filters={filters}
        getRowData={getRowData}
        entityType="broadcasts"
        emptyMessage="No broadcasts found"
        emptyDescription="Create your first broadcast to get started."
        customHeaderAction={customHeaderAction}
      />

      {/* Add/Edit Broadcast Modal */}
      <BroadcastModal
        open={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingBroadcast(null);
        }}
        onSave={handleSave}
        broadcast={editingBroadcast}
      />

      {/* Broadcast Detail Modal */}
      <BroadcastDetailModal
        open={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedBroadcast(null);
        }}
        broadcast={selectedBroadcast}
        onEdit={handleEdit}
        onDelete={() => {
          setRefreshKey(prev => prev + 1);
          setIsDetailModalOpen(false);
          setSelectedBroadcast(null);
        }}
      />
    </>
  );
}

