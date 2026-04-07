import React, { useState } from 'react';
import EntityListPage from './EntityListPage';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon, CheckIcon, XMarkIcon as XIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import PackageModal from './PackageModal';

export default function PackagesPage() {
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const getRowData = (pkg) => ({
    id: pkg.id,
    name: pkg.name,
    description: pkg.description,
    cost: pkg.cost,
    bonusCredit: pkg.bonus_credit,
    totalValue: pkg.total_value || (pkg.cost && pkg.bonus_credit ? parseFloat(pkg.cost) + parseFloat(pkg.bonus_credit) : pkg.cost),
    active: pkg.active,
    timesBought: pkg.times_bought || 0,
    icon: pkg.icon,
    iconColour: pkg.icon_colour,
    sortIndex: pkg.sort_index,
  });

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'expired':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'pending':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'cancelled':
        return 'bg-neutral-100 text-neutral-800 border-neutral-200';
      default:
        return 'bg-neutral-100 text-neutral-800 border-neutral-200';
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Name',
      render: (pkg) => (
        <button
          onClick={() => {
            setEditingPackage(pkg);
            setIsAddModalOpen(true);
          }}
          className="text-left text-sm font-medium text-brand-purple hover:text-brand-navy hover:underline"
        >
          {pkg.name || '—'}
        </button>
      ),
      sortable: true
    },
    {
      key: 'cost',
      label: 'Cost',
      render: (pkg) => (
        <div className="text-sm text-neutral-900">
          {pkg.cost !== null ? `$${parseFloat(pkg.cost).toFixed(2)}` : '—'}
        </div>
      ),
      sortable: true
    },
    {
      key: 'bonusCredit',
      label: 'Bonus credit',
      render: (pkg) => (
        <div className="text-sm text-neutral-900">
          {pkg.bonusCredit !== null ? `$${parseFloat(pkg.bonusCredit).toFixed(2)}` : '$0.00'}
        </div>
      ),
      sortable: true
    },
    {
      key: 'totalValue',
      label: 'Total package value',
      render: (pkg) => (
        <div className="text-sm text-neutral-900">
          {pkg.totalValue !== null ? `$${parseFloat(pkg.totalValue).toFixed(2)}` : '—'}
        </div>
      ),
      sortable: true
    },
    {
      key: 'active',
      label: 'Active',
      render: (pkg) => (
        <div className="flex items-center">
          {pkg.active ? (
            <CheckIcon className="h-5 w-5 text-green-600" />
          ) : (
            <XIcon className="h-5 w-5 text-red-600" />
          )}
        </div>
      ),
      sortable: true
    },
    {
      key: 'timesBought',
      label: 'Total times bought',
      render: (pkg) => (
        <div className="text-sm text-neutral-900">
          {pkg.timesBought || 0}
        </div>
      ),
      sortable: true
    },
  ];

  const filters = [
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' }
      ],
      placeholder: 'All Statuses'
    }
  ];

  const handleSave = () => {
    setIsAddModalOpen(false);
    setEditingPackage(null);
    setRefreshKey(prev => prev + 1);
  };

  const customHeaderAction = (
    <button
      onClick={() => {
        setEditingPackage(null);
        setIsAddModalOpen(true);
      }}
      className="px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors text-sm font-medium"
    >
      + Add Package
    </button>
  );

  return (
    <>
      <EntityListPage
        key={refreshKey}
        title="Packages"
        apiEndpoint="packages"
        columns={columns}
        filters={filters}
        getRowData={getRowData}
        entityType="packages"
        emptyMessage="No packages found"
        emptyDescription="Packages will appear here once they are created."
        customHeaderAction={customHeaderAction}
      />

      {/* Add/Edit Package Modal */}
      <PackageModal
        open={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingPackage(null);
        }}
        onSave={handleSave}
        package={editingPackage}
      />

      {/* Package Detail Modal */}
      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="mx-auto max-w-2xl w-full bg-white rounded-xl shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-neutral-200">
              <DialogTitle className="text-lg font-semibold text-neutral-900">
                Package Details
              </DialogTitle>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-500"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            {selectedPackage && (
              <div className="p-6 space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-neutral-500">Package Name</h3>
                  <p className="mt-1 text-sm text-neutral-900">{selectedPackage.name || '—'}</p>
                </div>
                {selectedPackage.description && (
                  <div>
                    <h3 className="text-sm font-medium text-neutral-500">Description</h3>
                    <p className="mt-1 text-sm text-neutral-900 whitespace-pre-wrap">
                      {selectedPackage.description}
                    </p>
                  </div>
                )}
                {selectedPackage.clientId && (
                  <div>
                    <h3 className="text-sm font-medium text-neutral-500">Client</h3>
                    <Link
                      to={`/clients/${selectedPackage.clientId}`}
                      className="mt-1 text-sm font-medium text-brand-purple hover:text-brand-navy"
                    >
                      {selectedPackage.client || '—'}
                    </Link>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-neutral-500">Status</h3>
                    <span
                      className={`mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(
                        selectedPackage.status
                      )}`}
                    >
                      {selectedPackage.status || '—'}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-neutral-500">Price</h3>
                    <p className="mt-1 text-sm text-neutral-900">
                      {selectedPackage.price !== null
                        ? `$${parseFloat(selectedPackage.price).toFixed(2)}`
                        : '—'}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-neutral-500">Lessons Used</h3>
                    <p className="mt-1 text-sm text-neutral-900">
                      {selectedPackage.lessonsUsed !== null && selectedPackage.lessonsIncluded !== null
                        ? `${selectedPackage.lessonsUsed} / ${selectedPackage.lessonsIncluded}`
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-neutral-500">Date Created</h3>
                    <p className="mt-1 text-sm text-neutral-900">
                      {selectedPackage.dateCreated
                        ? new Date(selectedPackage.dateCreated).toLocaleString('en-US', {
                            month: '2-digit',
                            day: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                          })
                        : '—'}
                    </p>
                  </div>
                </div>
                {selectedPackage.dateExpires && (
                  <div>
                    <h3 className="text-sm font-medium text-neutral-500">Expires</h3>
                    <p className="mt-1 text-sm text-neutral-900">
                      {new Date(selectedPackage.dateExpires).toLocaleString('en-US', {
                        month: '2-digit',
                        day: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                      })}
                    </p>
                  </div>
                )}
              </div>
            )}
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}

