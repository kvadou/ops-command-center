import React from 'react';
import { Link } from 'react-router-dom';
import EntityListPage from './EntityListPage';

export default function StudentsListPage() {
  const getRowData = (student) => {
    return {
      name: student.recipient_name || 'Unknown',
      payingClient: student.paying_client_name || 'N/A',
      clientId: student.paying_client_id || 'N/A'
    };
  };

  const tabs = [
    { key: 'all', label: 'All', filter: {} }
  ];

  const filters = [
    {
      key: 'client_id',
      label: 'Client ID',
      type: 'text',
      placeholder: 'Filter by client ID...',
      section: 'General',
      entityType: 'Students'
    }
  ];

  const metricsConfig = [
    {
      key: 'totalStudents',
      title: 'Total Students',
      subtitle: 'All students',
      helperText: 'Total number of students',
      tone: 'default',
    },
    {
      key: 'activeStudents',
      title: 'Active Students',
      subtitle: 'Recent activity',
      helperText: 'Students with lessons in last 30 days',
      tone: 'success',
    },
    {
      key: 'topLocation',
      title: 'Top Location',
      subtitle: 'Most students',
      helperText: 'Location with most students',
      tone: 'default',
    },
    {
      key: 'needsAttention',
      title: 'Needs Attention',
      subtitle: 'Low activity',
      helperText: 'No lessons in last 90 days',
      tone: 'warning',
    }
  ];

  return (
    <EntityListPage
      title="Students"
      entityType="students"
      apiEndpoint="students"
      getRowData={getRowData}
      columns={[
        { key: 'name', label: 'Student Name' },
        { key: 'payingClient', label: 'Paying Client' },
        { key: 'clientId', label: 'Client ID' }
      ]}
      searchPlaceholder="Search by first name, last name, or email..."
      tabs={tabs}
      filters={filters}
      getEntityLink={(student) => `/students/${student.recipient_id}`}
      getEntityName={(student) => student.recipient_name}
      getEntitySubtitle={(student) => student.paying_client_name || ''}
      metricsConfig={metricsConfig}
      customHeaderAction={
        <Link
          to="/students/add"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-md hover:bg-brand-navy transition-colors text-sm font-medium"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Student
        </Link>
      }
    />
  );
}
