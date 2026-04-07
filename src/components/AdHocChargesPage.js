import React, { useState } from 'react';
import EntityListPage from './EntityListPage';
import { Link } from 'react-router-dom';
import { PlusIcon, PencilIcon } from '@heroicons/react/24/outline';
import AdHocChargeModal from './AdHocChargeModal';

export default function AdHocChargesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCharge, setEditingCharge] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const getRowData = (charge) => ({
    id: charge.id,
    date: charge.date_occurred,
    category: charge.category_name,
    description: charge.description,
    amount: charge.net_gross,
    payContractor: charge.pay_contractor,
    tax: charge.tax_amount,
    currency: charge.currency || 'USD',
    client: charge.client_name,
    contractor: charge.contractor_name,
    service: charge.service_name,
    clientId: charge.client_id,
    contractorId: charge.contractor_id,
    serviceId: charge.service_id,
    appointmentId: charge.appointment_id,
    creator: charge.creator_first_name && charge.creator_last_name 
      ? `${charge.creator_first_name} ${charge.creator_last_name}`
      : null
  });

  const columns = [
    {
      key: 'date',
      label: 'Date',
      render: (charge) => (
        <div className="text-sm text-neutral-900">
          {charge.date ? new Date(charge.date).toLocaleDateString() : '—'}
        </div>
      ),
      sortable: true
    },
    {
      key: 'category',
      label: 'Category',
      render: (charge) => (
        <div className="text-sm font-medium text-neutral-900">
          {charge.category || '—'}
        </div>
      )
    },
    {
      key: 'description',
      label: 'Description',
      render: (charge) => (
        <div className="text-sm text-neutral-700 max-w-md truncate" title={charge.description || ''}>
          {charge.description || '—'}
        </div>
      )
    },
    {
      key: 'client',
      label: 'Client',
      render: (charge) => (
        charge.clientId ? (
          <Link 
            to={`/clients/${charge.clientId}`}
            className="text-sm font-medium text-brand-purple hover:text-brand-navy"
          >
            {charge.client || '—'}
          </Link>
        ) : (
          <span className="text-sm text-neutral-500">—</span>
        )
      )
    },
    {
      key: 'contractor',
      label: 'Tutor',
      render: (charge) => (
        charge.contractorId ? (
          <Link 
            to={`/tutors/${charge.contractorId}`}
            className="text-sm font-medium text-brand-purple hover:text-brand-navy"
          >
            {charge.contractor || '—'}
          </Link>
        ) : (
          <span className="text-sm text-neutral-500">—</span>
        )
      )
    },
    {
      key: 'service',
      label: 'Job',
      render: (charge) => (
        charge.serviceId ? (
          <Link 
            to={`/jobs/${charge.serviceId}`}
            className="text-sm font-medium text-brand-purple hover:text-brand-navy"
          >
            {charge.service || '—'}
          </Link>
        ) : (
          <span className="text-sm text-neutral-500">—</span>
        )
      )
    },
    {
      key: 'amount',
      label: 'Amount',
      render: (charge) => (
        <div className="text-sm font-medium text-neutral-900">
          {charge.amount ? `$${parseFloat(charge.amount).toFixed(2)}` : '—'}
        </div>
      ),
      sortable: true
    },
    {
      key: 'payContractor',
      label: 'Pay Tutor',
      render: (charge) => (
        <div className="text-sm font-medium text-neutral-900">
          {charge.payContractor !== null && charge.payContractor !== undefined 
            ? `$${parseFloat(charge.payContractor).toFixed(2)}` 
            : '—'}
        </div>
      ),
      sortable: true
    },
    {
      key: 'creator',
      label: 'Creator',
      render: (charge) => (
        <div className="text-sm text-neutral-700">
          {charge.creator || '—'}
        </div>
      )
    }
  ];

  const handleAdd = () => {
    setEditingCharge(null);
    setIsModalOpen(true);
  };

  const handleEdit = (charge) => {
    setEditingCharge(charge);
    setIsModalOpen(true);
  };

  const handleSave = () => {
    setRefreshKey(prev => prev + 1);
    setIsModalOpen(false);
    setEditingCharge(null);
    // Force page refresh by reloading the EntityListPage
    window.location.reload();
  };

  // Add Actions column to columns
  const columnsWithActions = [
    ...columns,
    {
      key: 'actions',
      label: 'Actions',
      render: (charge) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleEdit(charge)}
            className="p-1.5 text-brand-purple hover:text-brand-navy hover:bg-brand-purple/10 rounded transition-colors"
            title="Edit"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
        </div>
      )
    }
  ];

  return (
    <>
      <EntityListPage
        key={refreshKey}
        title="Ad Hoc Charges"
        entityType="ad-hoc-charge"
        apiEndpoint="ad-hoc-charges"
        getRowData={getRowData}
        columns={columnsWithActions}
        searchPlaceholder="Search by description, category, client, tutor..."
        filters={[
          {
            key: 'category_id',
            label: 'Category',
            type: 'select',
            options: [] // TODO: Fetch from adhoc_charge_categories table
          },
          {
            key: 'contractor_id',
            label: 'Tutor',
            type: 'select',
            options: [] // TODO: Fetch from contractors table
          },
          {
            key: 'client_id',
            label: 'Client',
            type: 'select',
            options: [] // TODO: Fetch from clients table
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
        ]}
        getEntityLink={(charge) => `#`} // TODO: Create detail page if needed
        getEntityName={(charge) => `${charge.category} - ${charge.description || 'No description'}`}
        getEntitySubtitle={(charge) => {
          const parts = [];
          if (charge.client) parts.push(`Client: ${charge.client}`);
          if (charge.contractor) parts.push(`Tutor: ${charge.contractor}`);
          if (charge.date) parts.push(new Date(charge.date).toLocaleDateString());
          return parts.join(' • ');
        }}
        customHeaderAction={
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors"
          >
            <PlusIcon className="h-5 w-5" />
            Add Ad Hoc Charge
          </button>
        }
      />

      <AdHocChargeModal
        open={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingCharge(null);
        }}
        onSave={handleSave}
        charge={editingCharge}
      />
    </>
  );
}

