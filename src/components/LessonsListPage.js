import React, { useState, useEffect } from 'react';
import EntityListPage from './EntityListPage';

export default function LessonsListPage() {
  const [tabCounts, setTabCounts] = useState({});

  useEffect(() => {
    // Fetch tab counts from the API
    fetch('/api/entity-lists/lessons?limit=1')
      .then(res => res.json())
      .then(data => {
        if (data.tabCounts) {
          setTabCounts(data.tabCounts);
        } else if (data.pagination) {
          setTabCounts({
            all: data.pagination.total
          });
        }
      })
      .catch(err => console.error('Error fetching counts:', err));
  }, []);

  const getRowData = (lesson) => {
    const startDate = new Date(lesson.start);
    const endDate = new Date(lesson.finish);
    
    return {
      date: startDate.toLocaleDateString(),
      time: `${startDate.toLocaleTimeString()} - ${endDate.toLocaleTimeString()}`,
      service: lesson.service_name || `Service ${lesson.service_id}`,
      topic: lesson.topic || 'N/A',
      status: lesson.status || 'Unknown'
    };
  };

  const tabs = [
    { key: 'all', label: 'All', filter: {} },
    { key: 'planned', label: 'Planned', filter: { status: 'planned' } },
    { key: 'complete', label: 'Complete', filter: { status: 'complete' } },
    { key: 'cancelled', label: 'Cancelled', filter: { status: 'cancelled' } }
  ].map(tab => ({
    ...tab,
    count: tabCounts[tab.key] || 0
  }));

  const filters = [
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { value: 'complete', label: 'Complete' },
        { value: 'planned', label: 'Planned' },
        { value: 'cancelled', label: 'Cancelled' },
        { value: 'cancelled-chargeable', label: 'Cancelled (Chargeable)' }
      ],
      section: 'General',
      entityType: 'Lessons'
    },
    {
      key: 'service_id',
      label: 'Service ID',
      type: 'text',
      placeholder: 'Filter by service ID...',
      section: 'General'
    },
    {
      key: 'start_date',
      label: 'Start Date',
      type: 'date',
      section: 'General'
    },
    {
      key: 'end_date',
      label: 'End Date',
      type: 'date',
      section: 'General'
    }
  ];

  return (
    <EntityListPage
      title="Lessons"
      entityType="lessons"
      apiEndpoint="lessons"
      getRowData={getRowData}
      columns={[
        { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time' },
        { key: 'service', label: 'Service/Job' },
        { key: 'topic', label: 'Topic' },
        { key: 'status', label: 'Status' }
      ]}
      searchPlaceholder="Search by topic or service name..."
      tabs={tabs}
      defaultTab="planned"
      filters={filters}
      getEntityLink={(lesson) => `/lessons/${lesson.appointment_id}`}
      getEntityName={(lesson) => `${new Date(lesson.start).toLocaleDateString()} - ${lesson.service_name}`}
      getEntitySubtitle={(lesson) => {
        const startDate = new Date(lesson.start);
        return `${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${lesson.status || ''}`;
      }}
      onTabCountsUpdate={setTabCounts}
    />
  );
}

