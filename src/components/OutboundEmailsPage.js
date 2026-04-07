import React, { useState } from 'react';
import EntityListPage from './EntityListPage';
import { Link } from 'react-router-dom';
import OutboundEmailDetailModal from './OutboundEmailDetailModal';

export default function OutboundEmailsPage() {
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const getRowData = (email) => ({
    id: email.id,
    to: email.client_email,
    subject: email.email_subject,
    status: email.status || (email.email_opened_at ? 'Opened' : 'Sent'),
    sendTime: email.sent_at || email.date_sent,
    studentName: email.student_name,
    clientName: email.client_name,
    tutorName: email.tutor_name,
  });

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'opened':
        return 'bg-green-100 text-green-800';
      case 'sent':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'bounced':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-neutral-100 text-neutral-800';
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      return dateString;
    }
  };

  const columns = [
    {
      key: 'to',
      label: 'To',
      render: (email) => (
        <div className="text-sm">
          <div className="font-medium text-neutral-900">{email.client_email}</div>
          {email.client_name && (
            <div className="text-xs text-neutral-500">{email.client_name}</div>
          )}
        </div>
      )
    },
    {
      key: 'subject',
      label: 'Subject',
      render: (email) => (
        <div className="text-sm text-neutral-900 max-w-md truncate" title={email.email_subject}>
          {email.email_subject || 'No subject'}
        </div>
      )
    },
    {
      key: 'status',
      label: 'Status',
      render: (email) => {
        const status = email.email_opened_at ? 'Opened' : (email.status || 'Sent');
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
            {status}
          </span>
        );
      }
    },
    {
      key: 'sendTime',
      label: 'Send Time',
      render: (email) => (
        <div className="text-sm text-neutral-900">
          {formatDateTime(email.sent_at || email.date_sent)}
        </div>
      )
    }
  ];

  const handleRowClick = (email) => {
    setSelectedEmail(email);
    setIsDetailModalOpen(true);
  };

  return (
    <>
      <EntityListPage
        title="Outbound Emails"
        apiEndpoint="outbound-emails"
        columns={columns}
        getRowData={getRowData}
        onRowClick={handleRowClick}
        searchPlaceholder="Search sent items..."
        filters={[]}
        emptyMessage="No outbound emails found"
        customHeaderNote="(Note: there may be a short delay after sending before messages appear in this list)"
      />
      
      {selectedEmail && (
        <OutboundEmailDetailModal
          isOpen={isDetailModalOpen}
          onClose={() => {
            setIsDetailModalOpen(false);
            setSelectedEmail(null);
          }}
          email={selectedEmail}
        />
      )}
    </>
  );
}

