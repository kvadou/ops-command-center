import React, { useState } from 'react';
import { useToast } from '../hooks/useToast';
import EntityListPage from './EntityListPage';
import { Link } from 'react-router-dom';
import { 
  PaperClipIcon, 
  ArrowDownTrayIcon,
  EnvelopeIcon,
  EyeIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

export default function ReportsPage() {
  const toast = useToast();
  const [sendingId, setSendingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const getRowData = (report) => ({
    id: report.id,
    dateSent: report.date_sent,
    tutorName: report.tutor_name,
    clientName: report.client_name,
    studentName: report.student_name,
    clientEmail: report.client_email,
    templateName: report.template_name,
    tutorFeedback: report.tutor_feedback,
    status: report.status,
    sentAt: report.sent_at,
    emailOpenedAt: report.email_opened_at,
    emailClickedAt: report.email_clicked_at,
    emailOpenedCount: report.email_opened_count || 0,
    emailClickedCount: report.email_clicked_count || 0
  });

  const handleSend = async (reportId) => {
    setSendingId(reportId);
    try {
      const response = await fetch(`/api/client-reports/${reportId}/send`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send report');
      }

      const result = await response.json();
      toast.success(`Report sent successfully to ${result.emailSent}`);
      // Refresh the page data
      window.location.reload();
    } catch (error) {
      console.error('Error sending report:', error);
      toast.error(`Failed to send report: ${error.message}`);
    } finally {
      setSendingId(null);
    }
  };

  const handleDownload = async (reportId) => {
    setDownloadingId(reportId);
    try {
      const response = await fetch(`/api/client-reports/${reportId}/preview`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to download report');
      }

      const html = await response.text();
      
      // Create a blob and download
      const blob = new Blob([html], { type: 'text/html' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${reportId}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading report:', error);
      toast.error(`Failed to download report: ${error.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleView = async (reportId) => {
    try {
      const response = await fetch(`/api/client-reports/${reportId}/preview`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load report');
      }

      const html = await response.text();
      
      // Open in new window
      const newWindow = window.open('', '_blank');
      newWindow.document.write(html);
      newWindow.document.close();
    } catch (error) {
      console.error('Error viewing report:', error);
      toast.error(`Failed to view report: ${error.message}`);
    }
  };

  const columns = [
    {
      key: 'dateSent',
      label: 'Date',
      render: (report) => (
        <div className="text-sm text-neutral-900">
          {report.dateSent ? new Date(report.dateSent).toLocaleDateString() : '—'}
        </div>
      ),
      sortable: true
    },
    {
      key: 'tutorName',
      label: 'Tutor',
      render: (report) => (
        <div className="text-sm font-medium text-neutral-900">
          {report.tutorName || '—'}
        </div>
      )
    },
    {
      key: 'clientName',
      label: 'Client',
      render: (report) => (
        <div className="text-sm text-neutral-900">
          {report.clientName || '—'}
        </div>
      )
    },
    {
      key: 'studentName',
      label: 'Student',
      render: (report) => (
        <div className="text-sm text-neutral-900">
          {report.studentName || '—'}
        </div>
      )
    },
    {
      key: 'templateName',
      label: 'Template',
      render: (report) => (
        <div className="text-sm text-neutral-700">
          {report.templateName || '—'}
        </div>
      )
    },
    {
      key: 'status',
      label: 'Status',
      render: (report) => {
        const statusColors = {
          'sent': 'bg-green-100 text-green-800',
          'pending': 'bg-yellow-100 text-yellow-800',
          'failed': 'bg-red-100 text-red-800'
        };
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            statusColors[report.status] || 'bg-neutral-100 text-neutral-800'
          }`}>
            {report.status || 'pending'}
          </span>
        );
      }
    },
    {
      key: 'engagement',
      label: 'Engagement',
      render: (report) => {
        if (report.status !== 'sent') return <span className="text-sm text-neutral-400">—</span>;
        
        const hasOpened = report.emailOpenedAt || report.emailOpenedCount > 0;
        const hasClicked = report.emailClickedAt || report.emailClickedCount > 0;
        
        return (
          <div className="flex items-center gap-2">
            {hasOpened && (
              <span className="inline-flex items-center text-xs text-green-600" title="Email opened">
                <EyeIcon className="h-4 w-4 mr-1" />
                {report.emailOpenedCount > 1 ? report.emailOpenedCount : ''}
              </span>
            )}
            {hasClicked && (
              <span className="inline-flex items-center text-xs text-blue-600" title="Link clicked">
                <PaperClipIcon className="h-4 w-4 mr-1" />
                {report.emailClickedCount > 1 ? report.emailClickedCount : ''}
              </span>
            )}
            {!hasOpened && !hasClicked && (
              <span className="text-xs text-neutral-400">No engagement</span>
            )}
          </div>
        );
      }
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (report) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleView(report.id)}
            className="px-3 py-1.5 text-sm font-medium text-brand-purple hover:text-brand-navy hover:bg-brand-light/30 rounded-lg transition-colors"
            title="View report"
          >
            <EyeIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => handleDownload(report.id)}
            disabled={downloadingId === report.id}
            className="px-3 py-1.5 text-sm font-medium text-brand-purple hover:text-brand-navy hover:bg-brand-light/30 rounded-lg transition-colors disabled:opacity-50"
            title="Download report"
          >
            {downloadingId === report.id ? (
              <ClockIcon className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowDownTrayIcon className="h-4 w-4" />
            )}
          </button>
          {report.status === 'pending' && (
            <button
              onClick={() => handleSend(report.id)}
              disabled={sendingId === report.id}
              className="px-3 py-1.5 text-sm font-medium text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
              title="Send report"
            >
              {sendingId === report.id ? (
                <ClockIcon className="h-4 w-4 animate-spin" />
              ) : (
                <EnvelopeIcon className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
      )
    }
  ];

  const filters = [
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { value: 'pending', label: 'Pending' },
        { value: 'sent', label: 'Sent' },
        { value: 'failed', label: 'Failed' }
      ]
    },
    {
      key: 'tutor_name',
      label: 'Tutor',
      type: 'text'
    },
    {
      key: 'client_name',
      label: 'Client',
      type: 'text'
    },
    {
      key: 'student_name',
      label: 'Student',
      type: 'text'
    },
    {
      key: 'template_name',
      label: 'Template',
      type: 'text'
    },
    {
      key: 'start_date',
      label: 'Start Date',
      type: 'date'
    },
    {
      key: 'end_date',
      label: 'End Date',
      type: 'date'
    }
  ];

  const tabs = [
    { key: 'all', label: 'All', filter: {} },
    { key: 'pending', label: 'Pending', filter: { status: 'pending' } },
    { key: 'sent', label: 'Sent', filter: { status: 'sent' } }
  ];

  const getEntityLink = (report) => {
    return '#';
  };

  return (
    <EntityListPage
      title="Reports"
      entityType="reports"
      apiEndpoint="reports"
      getRowData={getRowData}
      columns={columns}
      searchPlaceholder="Search reports, tutors, clients, students..."
      filters={filters}
      tabs={tabs}
      defaultTab="all"
      getEntityLink={getEntityLink}
    />
  );
}

