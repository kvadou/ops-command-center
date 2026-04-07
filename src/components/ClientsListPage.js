import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import EntityListPage from './EntityListPage';

export default function ClientsListPage() {
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
    fetch('/api/entity-lists/clients?limit=1')
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

  const getRowData = (client) => {
    const labelNames = Array.isArray(client.labels)
      ? client.labels.map(l => typeof l === 'string' ? l : (l.name || l.machine_name || '')).filter(Boolean).join(', ')
      : '';
    
    return {
      name: `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Unknown',
      email: client.email || 'N/A',
      phone: client.mobile || client.phone || 'N/A',
      status: client.status || 'Unknown',
      pipeline: client.pipeline_stage_name || 'N/A',
      balance: client.invoice_balance !== null ? `$${parseFloat(client.invoice_balance || 0).toFixed(2)}` : 'N/A',
      labels: labelNames || 'None'
    };
  };

  const tabs = [
    { key: 'all', label: 'All', filter: {} },
    { key: 'prospect', label: 'Prospect (Pipeline)', filter: { status: 'prospect' } },
    { key: 'live', label: 'Live', filter: { status: 'live' } },
    { key: 'dormant', label: 'Dormant', filter: { status: 'dormant' } }
  ].map(tab => ({
    ...tab,
    count: tabCounts[tab.key] || 0
  }));

  const filters = [
    {
      key: 'address',
      label: 'Address',
      type: 'text',
      placeholder: 'Enter address or zipcode',
      section: 'Map Filter',
      entityType: 'Clients'
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
      key: 'consent',
      label: 'Consent to store data',
      type: 'select',
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' }
      ],
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
      key: 'off_season_address',
      label: 'Off-Season Address',
      type: 'text',
      placeholder: 'Filter by off-season address',
      section: 'Custom Fields'
    },
    {
      key: 'event_name',
      label: 'Event Name',
      type: 'text',
      placeholder: 'Filter by event name',
      section: 'Custom Fields'
    }
  ];

  const metricsConfig = [
    {
      key: 'liveClients',
      title: 'Live Clients',
      subtitle: 'Total live clients',
      helperText: 'Clients with live status',
      tone: 'default',
      filter: { status: 'live' }
    },
    {
      key: 'highValue',
      title: 'High Value',
      subtitle: 'Top performing clients',
      helperText: 'Top 20% of clients by lifetime value',
      tone: 'success',
    },
    {
      key: 'activeClients',
      title: 'Active Clients',
      subtitle: 'Recent activity',
      helperText: 'Clients with lessons in last 30 days',
      tone: 'success',
    },
    {
      key: 'needsAttention',
      title: 'Needs Attention',
      subtitle: 'Payment or engagement issues',
      helperText: 'Payment issues or low engagement',
      tone: 'warning',
    }
  ];

  return (
    <EntityListPage
      title="Clients"
      entityType="clients"
      apiEndpoint="clients"
      getRowData={getRowData}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'status', label: 'Status' },
        { key: 'pipeline', label: 'Pipeline Stage' },
        { key: 'balance', label: 'Invoice Balance' },
        { key: 'labels', label: 'Labels' }
      ]}
      searchPlaceholder="Search by first name, last name, or email..."
      tabs={tabs}
      defaultTab="live"
      filters={filters}
      getEntityLink={(client) => `/clients/${client.client_id}`}
      getEntityName={(client) => `${client.first_name} ${client.last_name}`}
      getEntitySubtitle={(client) => client.email || client.status || ''}
      onTabCountsUpdate={setTabCounts}
      metricsConfig={metricsConfig}
      customHeaderAction={
        <Link
          to="/clients/add"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-md hover:bg-brand-navy transition-colors text-sm font-medium"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Client
        </Link>
      }
    />
  );
}
