import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import EntityListPage from './EntityListPage';

export default function AffiliatesListPage() {
  const [tabCounts, setTabCounts] = useState({});

  useEffect(() => {
    // Fetch tab counts from the API
    fetch('/api/entity-lists/affiliates?limit=1')
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

  const getRowData = (affiliate) => {
    return {
      name: affiliate.name || 'Unknown',
      email: affiliate.email || 'N/A',
      phone: affiliate.phone || affiliate.mobile || 'N/A',
      status: affiliate.status || 'Unknown',
      type: affiliate.type || 'N/A',
      location: affiliate.location || 'N/A'
    };
  };

  const tabs = [
    { key: 'all', label: 'All', filter: {}, statusKey: 'all' },
    { key: 'active', label: 'Active', filter: { status: 'active' }, statusKey: 'active' },
    { key: 'inactive', label: 'Inactive', filter: { status: 'inactive' }, statusKey: 'inactive' }
  ].map(tab => ({
    ...tab,
    count: tabCounts[tab.statusKey] || tabCounts[tab.key] || 0
  }));

  const filters = [
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' }
      ],
      section: 'Status'
    },
    {
      key: 'type',
      label: 'Type',
      type: 'text',
      placeholder: 'Filter by type',
      section: 'Details'
    },
    {
      key: 'location',
      label: 'Location',
      type: 'text',
      placeholder: 'Filter by location',
      section: 'Details'
    }
  ];

  const metricsConfig = [
    {
      key: 'activeAffiliates',
      title: 'Active Affiliates',
      subtitle: 'Total active affiliates',
      helperText: 'Affiliates with active status',
      tone: 'default',
      filter: { status: 'active' }
    },
    {
      key: 'highPerformers',
      title: 'High Performers',
      subtitle: 'Top performing affiliates',
      helperText: 'Top performing affiliates',
      tone: 'success',
    },
    {
      key: 'recentAdditions',
      title: 'Recent Additions',
      subtitle: 'New affiliates',
      helperText: 'Added in last 30 days',
      tone: 'success',
    },
    {
      key: 'needsAttention',
      title: 'Needs Attention',
      subtitle: 'Inactive affiliates',
      helperText: 'Affiliates with inactive status',
      tone: 'warning',
    }
  ];

  return (
    <EntityListPage
      title="Affiliates"
      entityType="affiliates"
      apiEndpoint="affiliates"
      getRowData={getRowData}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'status', label: 'Status' },
        { key: 'type', label: 'Type' },
        { key: 'location', label: 'Location' }
      ]}
      searchPlaceholder="Search by first name, last name, or email..."
      tabs={tabs}
      defaultTab="active"
      filters={filters}
      getEntityLink={(affiliate) => `/affiliates/${affiliate.id}`}
      getEntityName={(affiliate) => affiliate.name || 'Unknown'}
      getEntitySubtitle={(affiliate) => affiliate.email || affiliate.status || ''}
      onTabCountsUpdate={setTabCounts}
      metricsConfig={metricsConfig}
      customHeaderAction={
        <Link
          to="/affiliates/add"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-md hover:bg-brand-navy transition-colors text-sm font-medium"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Affiliate
        </Link>
      }
    />
  );
}
