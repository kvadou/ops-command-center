import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PlusIcon } from '@heroicons/react/24/outline';
import EntityListPage from './EntityListPage';

export default function AdministratorsListPage() {
  const [tabCounts, setTabCounts] = useState({});

  useEffect(() => {
    // Fetch tab counts from the API
    fetch('/api/entity-lists/administrators?limit=1')
      .then(res => res.json())
      .then(data => {
        if (data.tabCounts) {
          setTabCounts(data.tabCounts);
        } else if (data.pagination) {
          // Fallback to total if tabCounts not available
          setTabCounts({
            all: data.pagination.total
          });
        }
      })
      .catch(err => console.error('Error fetching counts:', err));
  }, []);

  const getRowData = (administrator) => {
    return {
      name: `${administrator.first_name || ''} ${administrator.last_name || ''}`.trim() || 'Unknown',
      email: administrator.email || 'N/A',
      phone: administrator.phone || administrator.mobile || 'N/A',
      status: administrator.status || 'Unknown',
      role: administrator.role || 'N/A',
      permissions: administrator.permissions || 'N/A'
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
      key: 'role',
      label: 'Role',
      type: 'text',
      placeholder: 'Filter by role',
      section: 'Details'
    }
  ];

  return (
    <EntityListPage
      title="Administrators"
      entityType="administrators"
      apiEndpoint="administrators"
      getRowData={getRowData}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'status', label: 'Status' },
        { key: 'role', label: 'Role' },
        { key: 'permissions', label: 'Permissions' }
      ]}
      searchPlaceholder="Search by name or email..."
      tabs={tabs}
      defaultTab="all"
      filters={filters}
      getEntityLink={(administrator) => `/admins/${administrator.id}`}
      customHeaderAction={
        <Link
          to="/admins/add"
          className="inline-flex items-center px-4 py-2 bg-brand-purple text-white text-sm font-medium rounded-md hover:bg-brand-navy transition-colors"
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          Add Administrator
        </Link>
      }
      getEntityName={(administrator) => `${administrator.first_name} ${administrator.last_name}`}
      getEntitySubtitle={(administrator) => administrator.email || administrator.role || ''}
      onTabCountsUpdate={setTabCounts}
    />
  );
}

