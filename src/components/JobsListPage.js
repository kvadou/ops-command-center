import React, { useState, useEffect } from 'react';
import EntityListPage from './EntityListPage';

export default function JobsListPage() {
  const [availableLabels, setAvailableLabels] = useState([]);
  const [tabCounts, setTabCounts] = useState({});

  useEffect(() => {
    // Fetch available labels
    fetch('/api/labels')
      .then(res => res.json())
      .then(data => {
        if (data.labels) {
          setAvailableLabels(data.labels.map(l => ({
            value: l.name || l.machine_name,
            label: l.name || l.machine_name
          })));
        }
      })
      .catch(err => console.error('Error fetching labels:', err));

    // Fetch tab counts from the API
    fetch('/api/entity-lists/jobs?limit=1')
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

  const getRowData = (job) => {
    const labelNames = Array.isArray(job.labels)
      ? job.labels.map(l => typeof l === 'string' ? l : (l.name || l.machine_name || '')).filter(Boolean).join(', ')
      : '';
    
    return {
      name: job.name || `Job ${job.service_id}`,
      status: job.status || 'Unknown',
      chargeRate: job.dft_charge_rate ? `$${parseFloat(job.dft_charge_rate).toFixed(2)}` : 'N/A',
      tutorRate: job.dft_contractor_rate ? `$${parseFloat(job.dft_contractor_rate).toFixed(2)}` : 'N/A',
      labels: labelNames || 'None',
      created: job.created_at ? new Date(job.created_at).toLocaleDateString() : 'N/A'
    };
  };

  const tabs = [
    { key: 'all', label: 'All', filter: {} },
    { key: 'available', label: 'Available for Application', filter: { status: 'planned' } },
    { key: 'in_progress', label: 'In Progress', filter: { status: 'in-progress' } },
    { key: 'finished', label: 'Finished', filter: { status: 'completed' } },
    { key: 'pending', label: 'Pending', filter: { status: 'pending' } },
    { key: 'gone_cold', label: 'Gone Cold', filter: { status: 'gone-cold' } }
  ].map(tab => ({
    ...tab,
    count: tabCounts[tab.key] || 0
  }));

  const filters = [
    {
      key: 'labels',
      label: 'Labels',
      type: 'checkbox-group',
      options: availableLabels,
      section: 'Labels',
      entityType: 'Jobs'
    }
  ];

  return (
    <EntityListPage
      title="Jobs"
      entityType="jobs"
      apiEndpoint="jobs"
      getRowData={getRowData}
      columns={[
        { key: 'name', label: 'Job Name' },
        { key: 'status', label: 'Status' },
        { key: 'chargeRate', label: 'Charge Rate' },
        { key: 'tutorRate', label: 'Tutor Rate' },
        { key: 'labels', label: 'Labels' },
        { key: 'created', label: 'Created' }
      ]}
      searchPlaceholder="Search by job name..."
      tabs={tabs}
      defaultTab="in_progress"
      filters={filters}
      getEntityLink={(job) => `/jobs/${job.service_id}`}
      getEntityName={(job) => job.name}
      getEntitySubtitle={(job) => job.status || ''}
      onTabCountsUpdate={setTabCounts}
    />
  );
}

