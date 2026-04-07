import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import EntityListPage from './EntityListPage';

export default function TutorsListPage() {
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
    fetch('/api/entity-lists/tutors?limit=1')
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

  const getRowData = (tutor) => {
    const labelNames = Array.isArray(tutor.labels)
      ? tutor.labels.map(l => typeof l === 'string' ? l : (l.name || l.machine_name || '')).filter(Boolean).join(', ')
      : '';
    
    return {
      name: `${tutor.first_name || ''} ${tutor.last_name || ''}`.trim() || 'Unknown',
      email: tutor.email || 'N/A',
      phone: tutor.mobile || tutor.phone || 'N/A',
      status: tutor.status || 'Unknown',
      rate: tutor.default_rate ? `$${parseFloat(tutor.default_rate).toFixed(2)}` : 'N/A',
      labels: labelNames || 'None'
    };
  };

  const tabs = [
    { key: 'all', label: 'All', filter: {}, statusKey: 'all' },
    { key: 'approved', label: 'Approved', filter: { status: 'approved' }, statusKey: 'approved' },
    { key: 'rejected', label: 'Rejected', filter: { status: 'rejected' }, statusKey: 'rejected' },
    { key: 'dormant', label: 'Dormant', filter: { status: 'dormant' }, statusKey: 'dormant' },
    { key: 'pending', label: 'Pending', filter: { status: 'pending' }, statusKey: 'pending' }
  ].map(tab => ({
    ...tab,
    count: tabCounts[tab.statusKey] || tabCounts[tab.key] || 0
  }));

  const filters = [
    {
      key: 'address',
      label: 'Address',
      type: 'text',
      placeholder: 'Enter address or zipcode',
      section: 'Map Filter',
      entityType: 'Tutors'
    },
    {
      key: 'radius',
      label: 'Radius',
      type: 'select',
      options: [
        { value: '5', label: '5 miles' },
        { value: '10', label: '10 miles' },
        { value: '25', label: '25 miles' },
        { value: '50', label: '50 miles' },
        { value: '100', label: '100 miles' }
      ],
      section: 'Map Filter'
    },
    {
      key: 'town',
      label: 'Town',
      type: 'text',
      placeholder: 'Filter by town',
      section: 'Role details'
    },
    {
      key: 'zipcode',
      label: 'Zipcode/Postcode',
      type: 'text',
      placeholder: 'Filter by zipcode',
      section: 'Role details'
    },
    {
      key: 'created_after',
      label: 'Created After',
      type: 'date',
      section: 'Role details'
    },
    {
      key: 'created_before',
      label: 'Created Before',
      type: 'date',
      section: 'Role details'
    },
    {
      key: 'labels',
      label: 'Labels',
      type: 'checkbox-group',
      options: availableLabels,
      section: 'Labels'
    },
    {
      key: 'tier_rate',
      label: 'Tier Rate',
      type: 'text',
      placeholder: 'Filter by tier rate',
      section: 'Custom Fields'
    },
    {
      key: 'preferred_teaching_area',
      label: 'Preferred Teaching Area',
      type: 'text',
      placeholder: 'Filter by preferred teaching area',
      section: 'Custom Fields'
    }
  ];

  const metricsConfig = [
    {
      key: 'activeTutors',
      title: 'Active Tutors',
      subtitle: 'Total approved tutors',
      helperText: 'Tutors with approved status',
      tone: 'default',
      filter: { status: 'approved' }
    },
    {
      key: 'rampedUp',
      title: 'Ramped Up',
      subtitle: 'Tutors with 10+ lessons',
      helperText: 'Tutors who completed 10+ lessons in first 60 days',
      tone: 'success',
      filter: { status: 'approved' }
    },
    {
      key: 'highPerformers',
      title: 'High Performers',
      subtitle: 'Top performing tutors',
      helperText: 'Top 20% of tutors by revenue',
      tone: 'success',
      filter: { status: 'approved' }
    },
    {
      key: 'needsAttention',
      title: 'Needs Attention',
      subtitle: 'Low activity tutors',
      helperText: 'Less than 5 lessons in last 90 days',
      tone: 'warning',
      filter: { status: 'approved' }
    }
  ];

  return (
    <EntityListPage
      title="Tutors"
      entityType="tutors"
      apiEndpoint="tutors"
      getRowData={getRowData}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'status', label: 'Status' },
        { key: 'rate', label: 'Default Rate' },
        { key: 'labels', label: 'Labels', wrap: true }
      ]}
      searchPlaceholder="Search by first name, last name, or email..."
      tabs={tabs}
      defaultTab="approved"
      filters={filters}
      getEntityLink={(tutor) => `/tutors/${tutor.contractor_id}`}
      getEntityName={(tutor) => `${tutor.first_name} ${tutor.last_name}`}
      getEntitySubtitle={(tutor) => tutor.email || tutor.status || ''}
      onTabCountsUpdate={setTabCounts}
      metricsConfig={metricsConfig}
      customHeaderAction={
        <Link
          to="/tutors/add"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-md hover:bg-brand-navy transition-colors text-sm font-medium"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Tutor
        </Link>
      }
    />
  );
}
