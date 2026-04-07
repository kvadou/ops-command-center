import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MagnifyingGlassIcon, FunnelIcon, XMarkIcon, TrashIcon } from '@heroicons/react/24/outline';
import SubscriptionModal from './SubscriptionModal';
import FilterModal from './FilterModal';
import AutocompleteSearch from './AutocompleteSearch';
import { useToast } from '../hooks/useToast';

// Define filters before component to avoid initialization order issues
const filters = [
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'cancelled', label: 'Cancelled' },
      { value: 'expired', label: 'Expired' },
      { value: 'pending', label: 'Pending' },
      { value: 'paused', label: 'Paused' }
    ],
    placeholder: 'All Statuses'
  },
  {
    key: 'client',
    label: 'Client',
    type: 'text',
    placeholder: 'Search by client name...'
  },
  {
    key: 'service',
    label: 'Service',
    type: 'text',
    placeholder: 'Search by service name...'
  }
];

export default function SubscriptionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState(() => {
    const filtersObj = {};
    filters.forEach(filter => {
      const value = searchParams.get(filter.key);
      if (value) {
        filtersObj[filter.key] = value;
      }
    });
    return filtersObj;
  });
  const toast = useToast();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingSubscription, setDeletingSubscription] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const getRowData = (subscription) => ({
    id: subscription.id,
    name: subscription.name,
    client: subscription.client_name || subscription.client,
    service: subscription.service_name || subscription.service,
    status: subscription.status,
    startDate: subscription.start_date,
    endDate: subscription.end_date,
    nextBillingDate: subscription.next_billing_date,
    amount: subscription.amount,
    frequency: subscription.frequency,
    createdAt: subscription.date_created || subscription.created_at,
  });

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'expired':
        return 'bg-neutral-100 text-neutral-800 border-neutral-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'paused':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-neutral-100 text-neutral-800 border-neutral-200';
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Name',
      render: (sub) => (
        <button
          onClick={() => {
            setEditingSubscription(sub);
            setIsAddModalOpen(true);
          }}
          className="text-left text-sm font-medium text-brand-purple hover:text-brand-navy hover:underline"
        >
          {sub.name || '—'}
        </button>
      ),
      sortable: true
    },
    {
      key: 'client',
      label: 'Client',
      render: (sub) => (
        <div className="text-sm text-neutral-900">
          {sub.client || '—'}
        </div>
      ),
      sortable: true
    },
    {
      key: 'service',
      label: 'Service',
      render: (sub) => (
        <div className="text-sm text-neutral-900">
          {sub.service || '—'}
        </div>
      ),
      sortable: true
    },
    {
      key: 'status',
      label: 'Status',
      render: (sub) => (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(
            sub.status
          )}`}
        >
          {sub.status || '—'}
        </span>
      ),
      sortable: true
    },
    {
      key: 'amount',
      label: 'Amount',
      render: (sub) => (
        <div className="text-sm text-neutral-900">
          {sub.amount !== null ? `$${parseFloat(sub.amount).toFixed(2)}` : '—'}
        </div>
      ),
      sortable: true
    },
    {
      key: 'frequency',
      label: 'Frequency',
      render: (sub) => (
        <div className="text-sm text-neutral-900">
          {sub.frequency || '—'}
        </div>
      ),
      sortable: true
    },
    {
      key: 'nextBillingDate',
      label: 'Next Billing',
      render: (sub) => (
        <div className="text-sm text-neutral-900">
          {sub.nextBillingDate
            ? new Date(sub.nextBillingDate).toLocaleDateString('en-US', {
                month: '2-digit',
                day: '2-digit',
                year: 'numeric'
              })
            : '—'}
        </div>
      ),
      sortable: true
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (sub, entity) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditingSubscription(entity);
              setIsAddModalOpen(true);
            }}
            className="px-3 py-1.5 text-xs font-medium text-brand-purple bg-white border border-brand-purple rounded-md hover:bg-brand-purple hover:text-white transition-colors"
          >
            VIEW
          </button>
          <button
            onClick={() => handleDeleteClick(entity)}
            className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors"
            title="Delete subscription"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      ),
      sortable: false
    },
  ];

  useEffect(() => {
    fetchData();
  }, [searchParams]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(searchParams);
      const url = `/api/entity-lists/subscriptions?${params}`;
      const response = await fetch(url);
      const responseData = await response.json().catch(() => ({}));
      
      if (!response.ok) {
        throw new Error(responseData.error || responseData.details || `Failed to fetch data (${response.status})`);
      }
      
      setData(responseData);
      setError(null);
    } catch (err) {
      console.error('Fetch Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const newParams = new URLSearchParams(searchParams);
    if (search) {
      newParams.set('search', search);
    } else {
      newParams.delete('search');
    }
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const handleFilterChange = (filterKey, value) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(filterKey, value);
    } else {
      newParams.delete(filterKey);
    }
    newParams.set('page', '1');
    setSearchParams(newParams);
    
    setActiveFilters(prev => {
      const updated = { ...prev };
      if (value) {
        updated[filterKey] = value;
      } else {
        delete updated[filterKey];
      }
      return updated;
    });
  };

  const handleApplyFilters = (filters) => {
    const newParams = new URLSearchParams(searchParams);
    
    // Clear existing filter params
    filters.forEach(filter => {
      newParams.delete(filter.key);
    });
    
    // Set new filter params
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        if (Array.isArray(value)) {
          newParams.set(key, value.join(','));
        } else {
          newParams.set(key, value);
        }
      }
    });
    
    newParams.set('page', '1');
    setSearchParams(newParams);
    setActiveFilters(filters);
  };

  const clearFilters = () => {
    const newParams = new URLSearchParams();
    if (search) {
      newParams.set('search', search);
    }
    setSearchParams(newParams);
    setActiveFilters({});
  };

  const handlePageChange = (newPage) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', newPage.toString());
    setSearchParams(newParams);
  };

  const getEntities = () => {
    if (!data) return [];
    if (data.data && Array.isArray(data.data)) return data.data;
    if (data.subscriptions) return data.subscriptions;
    return [];
  };
  
  const entities = getEntities();
  const pagination = data?.pagination;

  const handleSave = () => {
    setIsAddModalOpen(false);
    setEditingSubscription(null);
    fetchData();
  };

  const handleDeleteClick = (subscription) => {
    setDeletingSubscription(subscription);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingSubscription) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/subscriptions/${deletingSubscription.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete subscription');
      }

      // Refresh data after successful deletion
      await fetchData();
      setDeleteConfirmOpen(false);
      setDeletingSubscription(null);
    } catch (error) {
      console.error('Error deleting subscription:', error);
      toast.error(`Error deleting subscription: ${error.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false);
    setDeletingSubscription(null);
  };

  return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-6 xl:px-8 py-4 sm:py-6">
        {/* Page Header */}
        <div className="bg-white border-b border-neutral-200 shadow-sm mb-4 sm:mb-6">
          <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-neutral-900 leading-tight">Subscriptions</h1>
            <button
              onClick={() => {
                setEditingSubscription(null);
                setIsAddModalOpen(true);
              }}
              className="px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors text-sm font-medium"
            >
              + Add Subscription
            </button>
          </div>
        </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex items-center justify-between mb-4">
            <form onSubmit={handleSearch} className="flex-1 mr-4">
              <AutocompleteSearch
                value={search}
                onChange={setSearch}
                onSearch={handleSearch}
                placeholder="Search subscriptions..."
                getSuggestions={async (query) => {
                  const params = new URLSearchParams();
                  params.set('search', query);
                  params.set('limit', '10');
                  try {
                    const response = await fetch(`/api/entity-lists/subscriptions?${params.toString()}`);
                    if (!response.ok) throw new Error('Failed to fetch suggestions');
                    const data = await response.json();
                    return data.subscriptions || [];
                  } catch (error) {
                    console.error('Error fetching suggestions:', error);
                    return [];
                  }
                }}
                minChars={2}
              />
            </form>
            <div className="flex gap-2">
              {filters.length > 0 && (
                <button
                  onClick={() => setIsFilterModalOpen(true)}
                  className="flex items-center justify-center gap-2 px-4 py-2 border border-neutral-300 rounded-md hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-brand-purple transition-colors text-sm font-medium"
                >
                  <FunnelIcon className="h-5 w-5 text-brand-purple" />
                  <span className="text-sm font-medium text-neutral-700">Filter</span>
                  {Object.keys(activeFilters).length > 0 && (
                    <span className="ml-1 px-2 py-0.5 text-xs font-semibold text-white bg-brand-purple rounded-full">
                      {Object.keys(activeFilters).length}
                    </span>
                  )}
                </button>
              )}
              <button
                type="submit"
                onClick={handleSearch}
                className="px-6 py-2 bg-brand-purple text-white rounded-md hover:bg-brand-navy transition-colors text-sm font-medium"
              >
                Search
              </button>
            </div>
          </div>

          {/* Active Filters Display */}
          {Object.keys(activeFilters).length > 0 && (
            <div className="border-t border-neutral-200 pt-4">
              <div className="flex items-center flex-wrap gap-2">
                <span className="text-sm font-medium text-neutral-700">Active Filters:</span>
                {Object.entries(activeFilters).map(([key, value]) => {
                  const filter = filters.find(f => f.key === key);
                  if (!filter) return null;
                  
                  let displayValue = value;
                  if (filter.type === 'select') {
                    const option = filter.options?.find(opt => opt.value === value);
                    displayValue = option?.label || value;
                  }
                  
                  return (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-brand-light text-brand-navy rounded-full text-sm"
                    >
                      <span className="font-medium">{filter.label}:</span>
                      <span>{displayValue}</span>
                      <button
                        onClick={() => handleFilterChange(key, '')}
                        className="ml-1 text-brand-navy hover:text-brand-purple transition-colors"
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </span>
                  );
                })}
                <button
                  onClick={clearFilters}
                  className="text-sm text-brand-purple hover:text-brand-navy font-medium transition-colors"
                >
                  Clear All
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Filter Modal */}
        <FilterModal
          isOpen={isFilterModalOpen}
          onClose={() => setIsFilterModalOpen(false)}
          filters={filters}
          activeFilters={activeFilters}
          onApplyFilters={handleApplyFilters}
          onClearFilters={clearFilters}
        />

        {/* Results */}
        {loading ? (
          <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
            <p className="mt-4 text-sm text-neutral-600">Loading...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
            <p className="text-sm text-red-600">Error: {error}</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      {columns.map((col) => (
                        <th
                          key={col.key}
                          className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider"
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {entities.length === 0 ? (
                      <tr>
                        <td colSpan={columns.length} className="px-6 py-12 text-center text-sm text-neutral-500">
                          <div>
                            <p className="font-medium">No subscriptions found</p>
                            <p className="mt-1 text-neutral-400">Subscriptions will appear here once they are created.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      entities.map((entity, index) => {
                        const rowData = getRowData(entity);
                        return (
                          <tr key={entity.id || index} className="hover:bg-neutral-50 transition-colors">
                            {columns.map((col) => (
                              <td key={col.key} className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                                {col.render ? col.render(rowData, entity) : rowData[col.key]}
                              </td>
                            ))}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <div className="text-sm text-neutral-700">
                  Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    className="px-4 py-2 border border-neutral-300 rounded-md text-sm font-medium text-neutral-700 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="px-4 py-2 border border-neutral-300 rounded-md text-sm font-medium text-neutral-700 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Add/Edit Subscription Modal */}
        <SubscriptionModal
          open={isAddModalOpen}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingSubscription(null);
          }}
          onSave={handleSave}
          subscription={editingSubscription}
          onDelete={editingSubscription ? () => handleDeleteClick(editingSubscription) : undefined}
        />

        {/* Delete Confirmation Dialog */}
        {deleteConfirmOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-neutral-900 mb-2">Delete Subscription</h3>
                <p className="text-sm text-neutral-600 mb-4">
                  Are you sure you want to delete this subscription? This action cannot be undone.
                  {deletingSubscription && (
                    <span className="block mt-2 font-medium">
                      Subscription: {deletingSubscription.name || deletingSubscription.service_name || 'N/A'}
                    </span>
                  )}
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={handleDeleteCancel}
                    disabled={deleting}
                    className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteConfirm}
                    disabled={deleting}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
  );
}

