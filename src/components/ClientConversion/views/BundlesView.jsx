import React, { useState } from 'react';
import DatePicker from 'react-datepicker';
import { PlusIcon, FunnelIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useResizableColumns, ResizeHandle } from '../useResizableColumns';

// Bundle templates for quick form filling
const BUNDLE_TEMPLATES = [
  { id: 'none', label: 'Select a template (optional)', value: null },
  // 10-Lesson Bundles
  {
    id: '10-lesson-home-1-1',
    label: '10% Off 10-Lesson Bundle - Home 1:1 ($1,071)',
    value: {
      bundleName: '10% Off 10-Lesson Bundle - Home 1:1',
      numberOfLessons: '10',
      lessonRate: '119.00',
      discountPercentage: '10',
    }
  },
  {
    id: '10-lesson-online-1-1',
    label: '10% Off 10-Lesson Bundle - Online 1:1 ($531)',
    value: {
      bundleName: '10% Off 10-Lesson Bundle - Online 1:1',
      numberOfLessons: '10',
      lessonRate: '59.00',
      discountPercentage: '10',
    }
  },
  {
    id: '10-lesson-online-group',
    label: '10% Off 10-Lesson Bundle - Online Group ($360)',
    value: {
      bundleName: '10% Off 10-Lesson Bundle - Online Group',
      numberOfLessons: '10',
      lessonRate: '40.00',
      discountPercentage: '10',
    }
  },
  {
    id: '10-lesson-private-group',
    label: '10% Off 10-Lesson Bundle - Private Group ($756)',
    value: {
      bundleName: '10% Off 10-Lesson Bundle - Private Group',
      numberOfLessons: '10',
      lessonRate: '84.00',
      discountPercentage: '10',
    }
  },
  {
    id: '10-lesson-siblings',
    label: '10% Off 10-Lesson Bundle - Siblings ($1,260)',
    value: {
      bundleName: '10% Off 10-Lesson Bundle - Siblings',
      numberOfLessons: '10',
      lessonRate: '140.00',
      discountPercentage: '10',
    }
  },
  {
    id: '10-lesson-90-min',
    label: '10% Off 10-Lesson Bundle - 90 Min ($1,606)',
    value: {
      bundleName: '10% Off 10-Lesson Bundle - 90 Min',
      numberOfLessons: '10',
      lessonRate: '178.50',
      discountPercentage: '10',
    }
  },
  // New Student Bundles (5 lessons)
  {
    id: 'new-student-home-1-1',
    label: '10% Off New Student Bundle - Home 1:1 ($535)',
    value: {
      bundleName: '10% Off New Student Bundle - Home 1:1',
      numberOfLessons: '5',
      lessonRate: '119.00',
      discountPercentage: '10',
    }
  },
  {
    id: 'new-student-online-1-1',
    label: '10% Off New Student Bundle - Online 1:1 ($265)',
    value: {
      bundleName: '10% Off New Student Bundle - Online 1:1',
      numberOfLessons: '5',
      lessonRate: '59.00',
      discountPercentage: '10',
    }
  },
  {
    id: 'new-student-online-group',
    label: '10% Off New Student Bundle - Online Group ($180)',
    value: {
      bundleName: '10% Off New Student Bundle - Online Group',
      numberOfLessons: '5',
      lessonRate: '40.00',
      discountPercentage: '10',
    }
  },
  {
    id: 'new-student-private-group',
    label: '10% Off New Student Bundle - Private Group ($378)',
    value: {
      bundleName: '10% Off New Student Bundle - Private Group',
      numberOfLessons: '5',
      lessonRate: '84.00',
      discountPercentage: '10',
    }
  },
  {
    id: 'new-student-siblings',
    label: '10% Off New Student Bundle - Siblings ($630)',
    value: {
      bundleName: '10% Off New Student Bundle - Siblings',
      numberOfLessons: '5',
      lessonRate: '140.00',
      discountPercentage: '10',
    }
  },
  {
    id: 'new-student-90-min',
    label: '10% Off New Student Bundle - 90 Min ($803)',
    value: {
      bundleName: '10% Off New Student Bundle - 90 Min',
      numberOfLessons: '5',
      lessonRate: '178.50',
      discountPercentage: '10',
    }
  },
];

/**
 * BundlesView - View for managing client bundles
 *
 * Displays bundles with metrics, filtering, and search capabilities.
 */
export default function BundlesView({
  bundles,
  bundlesMetricsTimeRange,
  setBundlesMetricsTimeRange,
  bundlesMetricsTimeRangePreset,
  setBundlesMetricsTimeRangePreset,
  getYTDDateRange,
  bundleFilters,
  setBundleFilters,
  bundleSortConfig,
  setBundleSortConfig,
  bundleSearchQuery,
  setBundleSearchQuery,
  showBundleMarketFilter,
  setShowBundleMarketFilter,
  showBundleSourceFilter,
  setShowBundleSourceFilter,
  bundlePurchaseDateFilterRef,
  bundleSourceFilterRef,
  bundleMarketFilterRef,
  showCreateBundleModal,
  setShowCreateBundleModal,
  bundleForm,
  setBundleForm,
  clientSearchQuery,
  setClientSearchQuery,
  clientSearchResults,
  setClientSearchResults,
  showClientSearchResults,
  setShowClientSearchResults,
  clientSearchError,
  setClientSearchError,
  selectedClientFromSearch,
  setSelectedClientFromSearch,
  highlightedClientIndex,
  setHighlightedClientIndex,
  handleCreateBundle,
  isCreatingBundle,
  isSearchingClients,
  searchClientsForBundle,
  formatDate,
  bundlesPage,
  setBundlesPage,
  bundlesPerPage,
  setBundlesPerPage,
  showBundlePurchaseDateFilter,
  setShowBundlePurchaseDateFilter,
  tempBundleDateFilters,
  setTempBundleDateFilters,
  bundleNameFilterRef,
  showBundleNameFilter,
  setShowBundleNameFilter,
  getMarketChipColors,
}) {
  // Handle client search input change
  const handleClientSearchInputChange = (e) => {
    const value = e.target.value;
    setClientSearchQuery(value);
    if (value.length >= 2) {
      searchClientsForBundle(value);
      setShowClientSearchResults(true);
    } else {
      setClientSearchResults([]);
      setShowClientSearchResults(false);
    }
  };

  // Handle client selection from search results
  const handleClientSelect = (client) => {
    setBundleForm(prev => ({
      ...prev,
      selectedClient: client,
      clientSearch: `${client.first_name || ''} ${client.last_name || ''}`.trim() || client.email || ''
    }));
    setSelectedClientFromSearch(client);
    setShowClientSearchResults(false);
    setClientSearchQuery('');
    setClientSearchResults([]);
  };

  // Resizable columns
  const { columnWidths, handleResizeStart } = useResizableColumns('columnWidths_cctBundles');

  // Template selection state
  const [selectedTemplate, setSelectedTemplate] = useState('none');

  // Handle template selection
  const handleTemplateSelect = (templateId) => {
    setSelectedTemplate(templateId);
    const template = BUNDLE_TEMPLATES.find(t => t.id === templateId);
    if (template?.value) {
      setBundleForm(prev => ({
        ...prev,
        ...template.value
      }));
    }
  };

  return (
    <div className="space-y-6">
          {/* Summary Metrics */}
          {(() => {
            // Filter bundles by metrics time range
            const filteredBundlesForMetrics = bundles.filter(b => {
              if (!b.purchase_date) return false;
              const purchaseDate = new Date(b.purchase_date);
              const startDate = bundlesMetricsTimeRange.start;
              const endDate = bundlesMetricsTimeRange.end;
              
              if (startDate) {
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                if (purchaseDate < start) return false;
              }
              
              if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                if (purchaseDate > end) return false;
              }
              
              return true;
            });
            
            const totalRevenue = filteredBundlesForMetrics.reduce((sum, b) => sum + (Number(b.bundle_total) || 0), 0);
            const totalCredits = filteredBundlesForMetrics.reduce((sum, b) => sum + (Number(b.credit_total) || 0), 0);
            const avgBundleValue = filteredBundlesForMetrics.length > 0 ? totalRevenue / filteredBundlesForMetrics.length : 0;
            const uniqueClients = new Set(filteredBundlesForMetrics.map(b => b.client_id).filter(Boolean)).size;
            
            // Format date range for display
            const formatDateRange = () => {
              if (!bundlesMetricsTimeRange.start && !bundlesMetricsTimeRange.end) return 'All Time';
              const start = bundlesMetricsTimeRange.start ? new Date(bundlesMetricsTimeRange.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
              const end = bundlesMetricsTimeRange.end ? new Date(bundlesMetricsTimeRange.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
              if (start && end) return `${start} - ${end}`;
              if (start) return `From ${start}`;
              if (end) return `Until ${end}`;
              return 'All Time';
            };
            
            return (
              <div className="space-y-4">
                {/* Time Range Selector */}
                <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 border border-neutral-200">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="text-sm font-medium text-neutral-700">Time Range:</label>
                      <select
                        value={bundlesMetricsTimeRangePreset}
                        onChange={(e) => {
                          const value = e.target.value;
                          setBundlesMetricsTimeRangePreset(value);
                          if (value === 'ytd') {
                            setBundlesMetricsTimeRange(getYTDDateRange());
                          } else if (value === 'all') {
                            setBundlesMetricsTimeRange({ start: null, end: null });
                          } else if (value === 'custom') {
                            // Initialize with current date range or default to last 30 days
                            if (!bundlesMetricsTimeRange.start || !bundlesMetricsTimeRange.end) {
                              const end = new Date();
                              const start = new Date();
                              start.setDate(start.getDate() - 30);
                              setBundlesMetricsTimeRange({ start, end });
                            }
                          }
                        }}
                        className="rounded-md border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
                      >
                        <option value="ytd">Year to Date</option>
                        <option value="all">All Time</option>
                        <option value="custom">Custom Range</option>
                      </select>
                      
                      {bundlesMetricsTimeRangePreset === 'custom' && (
                        <div className="flex items-center gap-2">
                          <DatePicker
                            selected={bundlesMetricsTimeRange.start}
                            onChange={(date) => setBundlesMetricsTimeRange(prev => ({ ...prev, start: date }))}
                            selectsStart
                            startDate={bundlesMetricsTimeRange.start}
                            endDate={bundlesMetricsTimeRange.end}
                            placeholderText="Start Date"
                            className="rounded-md border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm px-3 py-1.5"
                            dateFormat="MMM d, yyyy"
                          />
                          <span className="text-neutral-500">to</span>
                          <DatePicker
                            selected={bundlesMetricsTimeRange.end}
                            onChange={(date) => setBundlesMetricsTimeRange(prev => ({ ...prev, end: date }))}
                            selectsEnd
                            startDate={bundlesMetricsTimeRange.start}
                            endDate={bundlesMetricsTimeRange.end}
                            minDate={bundlesMetricsTimeRange.start}
                            placeholderText="End Date"
                            className="rounded-md border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm px-3 py-1.5"
                            dateFormat="MMM d, yyyy"
                          />
                        </div>
                      )}
                    </div>
                    <div className="text-sm text-neutral-600">
                      Showing: {formatDateRange()}
                    </div>
                  </div>
                </div>
                
                {/* Metrics Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 border-l-4 border-[#50C8DF]">
                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Total Purchases</p>
                    <p className="text-2xl font-bold text-neutral-900 mt-1">{filteredBundlesForMetrics.length}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 border-l-4 border-[#34B256]">
                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Total Revenue</p>
                    <p className="text-2xl font-bold text-neutral-900 mt-1">${totalRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 border-l-4 border-primary-500">
                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Total Credits</p>
                    <p className="text-2xl font-bold text-neutral-900 mt-1">${totalCredits.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 border-l-4 border-[#F79A30]">
                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Avg Bundle Value</p>
                    <p className="text-2xl font-bold text-neutral-900 mt-1">${avgBundleValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                  </div>
                </div>
              </div>
            );
          })()}
          
          {/* Bundles Table */}
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <div className="px-4 py-5 sm:p-6">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg leading-6 font-medium text-neutral-900">
                    Bundle Purchases {(() => {
                      // Calculate filtered count for display
                      const parsedBundles = bundles.map(b => {
                        const bundleTotal = b.bundle_total != null ? parseFloat(b.bundle_total) : 0;
                        const creditTotal = b.credit_total != null ? parseFloat(b.credit_total) : 0;
                        const discountPct = b.discount_percentage != null ? parseInt(b.discount_percentage) : 0;
                        return {
                          ...b,
                          bundle_total: isNaN(bundleTotal) ? 0 : bundleTotal,
                          credit_total: isNaN(creditTotal) ? 0 : creditTotal,
                          discount_percentage: isNaN(discountPct) ? 0 : discountPct
                        };
                      });
                      
                      let filtered = parsedBundles;
                      if (bundleFilters.market !== 'all') {
                        filtered = filtered.filter(b => b.market === bundleFilters.market);
                      }
                      if (bundleFilters.source !== 'all') {
                        filtered = filtered.filter(b => b.source === bundleFilters.source);
                      }
                      if (bundleFilters.bundleName !== 'all') {
                        filtered = filtered.filter(b => b.bundle_name && b.bundle_name === bundleFilters.bundleName);
                      }
                      if (bundleFilters.purchaseDate.start || bundleFilters.purchaseDate.end) {
                        filtered = filtered.filter(b => {
                          if (!b.purchase_date) return false;
                          const purchaseDate = new Date(b.purchase_date);
                          if (bundleFilters.purchaseDate.start) {
                            const startDate = new Date(bundleFilters.purchaseDate.start);
                            startDate.setHours(0, 0, 0, 0);
                            if (purchaseDate < startDate) return false;
                          }
                          if (bundleFilters.purchaseDate.end) {
                            const endDate = new Date(bundleFilters.purchaseDate.end);
                            endDate.setHours(23, 59, 59, 999);
                            if (purchaseDate > endDate) return false;
                          }
                          return true;
                        });
                      }
                      return `(${filtered.length})`;
                    })()}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setBundleForm({
                      clientSearch: '',
                      selectedClient: null,
                      bundleName: '',
                      numberOfLessons: '',
                      lessonRate: '',
                      discountPercentage: '',
                      paymentMethod: 'auto_charge',
                    });
                    setClientSearchResults([]);
                    setSelectedTemplate('none');
                    setShowCreateBundleModal(true);
                  }}
                  className="inline-flex items-center justify-center rounded-md border border-transparent bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition"
                >
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Create Bundle
                </button>
                </div>
              </div>
              
              {(() => {
                // Parse numeric fields (they come as strings from DB)
                const parsedBundles = bundles.map(b => {
                  const bundleTotal = b.bundle_total != null ? parseFloat(b.bundle_total) : 0;
                  const creditTotal = b.credit_total != null ? parseFloat(b.credit_total) : 0;
                  const discountPct = b.discount_percentage != null ? parseInt(b.discount_percentage) : 0;
                  
                  return {
                    ...b,
                    bundle_total: isNaN(bundleTotal) ? 0 : bundleTotal,
                    credit_total: isNaN(creditTotal) ? 0 : creditTotal,
                    discount_percentage: isNaN(discountPct) ? 0 : discountPct
                  };
                });
                
                // Apply filters
                let filteredBundles = parsedBundles;
                
                // Market filter
                if (bundleFilters.market !== 'all') {
                  filteredBundles = filteredBundles.filter(b => b.market === bundleFilters.market);
                }
                
                // Source filter
                if (bundleFilters.source !== 'all') {
                  filteredBundles = filteredBundles.filter(b => b.source === bundleFilters.source);
                }
                
                // Bundle name filter
                if (bundleFilters.bundleName !== 'all') {
                  filteredBundles = filteredBundles.filter(b => 
                    b.bundle_name && b.bundle_name === bundleFilters.bundleName
                  );
                }
                
                // Purchase date filter
                if (bundleFilters.purchaseDate.start || bundleFilters.purchaseDate.end) {
                  filteredBundles = filteredBundles.filter(b => {
                    if (!b.purchase_date) return false;
                    const purchaseDate = new Date(b.purchase_date);
                    if (bundleFilters.purchaseDate.start) {
                      const startDate = new Date(bundleFilters.purchaseDate.start);
                      startDate.setHours(0, 0, 0, 0);
                      if (purchaseDate < startDate) return false;
                    }
                    if (bundleFilters.purchaseDate.end) {
                      const endDate = new Date(bundleFilters.purchaseDate.end);
                      endDate.setHours(23, 59, 59, 999);
                      if (purchaseDate > endDate) return false;
                    }
                    return true;
                  });
                }
                
                // Apply sorting
                filteredBundles = [...filteredBundles].sort((a, b) => {
                  if (!bundleSortConfig?.field) return 0;
                  
                  const direction = bundleSortConfig.direction === 'desc' ? -1 : 1;
                  const field = bundleSortConfig.field;
                  
                  const getValue = (bundle, field) => {
                    switch (field) {
                      case 'client':
                        return `${bundle.first_name || ''} ${bundle.last_name || ''}`.trim().toLowerCase();
                      case 'purchase_date':
                        return bundle.purchase_date ? new Date(bundle.purchase_date).getTime() : 0;
                      case 'source':
                        return (bundle.source || '').toLowerCase();
                      case 'bundle_name':
                        return (bundle.bundle_name || '').toLowerCase();
                      case 'discount_percentage':
                        return bundle.discount_percentage || 0;
                      case 'bundle_total':
                        return bundle.bundle_total || 0;
                      case 'credit_total':
                        return bundle.credit_total || 0;
                      case 'market':
                        return (bundle.market || '').toLowerCase();
                      default:
                        return 0;
                    }
                  };
                  
                  const aVal = getValue(a, field);
                  const bVal = getValue(b, field);
                  
                  if (aVal < bVal) return -1 * direction;
                  if (aVal > bVal) return 1 * direction;
                  return 0;
                });
                
                // Calculate pagination
                const totalBundles = filteredBundles.length;
                const totalPages = Math.ceil(totalBundles / bundlesPerPage);
                const startIndex = (bundlesPage - 1) * bundlesPerPage;
                const endIndex = startIndex + bundlesPerPage;
                const paginatedBundles = filteredBundles.slice(startIndex, endIndex);
                
                if (filteredBundles.length === 0) {
                  return (
                    <div className="text-center py-12">
                      <ShoppingBagIcon className="mx-auto h-12 w-12 text-neutral-400" />
                      <h3 className="mt-2 text-sm font-medium text-neutral-900">No bundles found</h3>
                      <p className="mt-1 text-sm text-neutral-500">
                        {bundles.length === 0 
                          ? 'No bundle purchases have been recorded yet.'
                          : 'No bundles match the selected filters.'}
                      </p>
                    </div>
                  );
                }
                
                return (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-neutral-200 table-fixed">
                      <thead className="bg-neutral-50">
                        <tr>
                          <th className="relative px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.client || 180 }}>
                            <button
                              type="button"
                              onClick={() => setBundleSortConfig(prev => ({
                                field: 'client',
                                direction: prev.field === 'client' && prev.direction === 'asc' ? 'desc' : 'asc'
                              }))}
                              className="flex items-center gap-1 hover:text-neutral-700"
                            >
                              Client
                              {bundleSortConfig.field === 'client' && (
                                <span>{bundleSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </button>
                            <ResizeHandle colKey="client" onResizeStart={handleResizeStart} />
                          </th>
                          <th className="relative px-6 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.purchase_date || 140 }}>
                            <button
                              type="button"
                              onClick={() => setBundleSortConfig(prev => ({
                                field: 'purchase_date',
                                direction: prev.field === 'purchase_date' && prev.direction === 'asc' ? 'desc' : 'asc'
                              }))}
                              className="flex items-center justify-center gap-1 hover:text-neutral-700 mx-auto"
                            >
                              Purchase Date
                              {bundleSortConfig.field === 'purchase_date' && (
                                <span>{bundleSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </button>
                            <ResizeHandle colKey="purchase_date" onResizeStart={handleResizeStart} />
                          </th>
                          <th className="relative px-6 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.source || 120 }}>
                            <button
                              type="button"
                              onClick={() => setBundleSortConfig(prev => ({
                                field: 'source',
                                direction: prev.field === 'source' && prev.direction === 'asc' ? 'desc' : 'asc'
                              }))}
                              className="flex items-center justify-center gap-1 hover:text-neutral-700 mx-auto"
                            >
                              Source
                              {bundleSortConfig.field === 'source' && (
                                <span>{bundleSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </button>
                            <ResizeHandle colKey="source" onResizeStart={handleResizeStart} />
                          </th>
                          <th className="relative px-6 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.bundle_name || 200 }}>
                            <button
                              type="button"
                              onClick={() => setBundleSortConfig(prev => ({
                                field: 'bundle_name',
                                direction: prev.field === 'bundle_name' && prev.direction === 'asc' ? 'desc' : 'asc'
                              }))}
                              className="flex items-center justify-center gap-1 hover:text-neutral-700 mx-auto"
                            >
                              Bundle Name
                              {bundleSortConfig.field === 'bundle_name' && (
                                <span>{bundleSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </button>
                            <ResizeHandle colKey="bundle_name" onResizeStart={handleResizeStart} />
                          </th>
                          <th className="relative px-6 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.discount || 100 }}>
                            <button
                              type="button"
                              onClick={() => setBundleSortConfig(prev => ({
                                field: 'discount_percentage',
                                direction: prev.field === 'discount_percentage' && prev.direction === 'asc' ? 'desc' : 'asc'
                              }))}
                              className="flex items-center justify-center gap-1 hover:text-neutral-700 mx-auto"
                            >
                              Discount
                              {bundleSortConfig.field === 'discount_percentage' && (
                                <span>{bundleSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </button>
                            <ResizeHandle colKey="discount" onResizeStart={handleResizeStart} />
                          </th>
                          <th className="relative px-6 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.bundle_total || 130 }}>
                            <button
                              type="button"
                              onClick={() => setBundleSortConfig(prev => ({
                                field: 'bundle_total',
                                direction: prev.field === 'bundle_total' && prev.direction === 'asc' ? 'desc' : 'asc'
                              }))}
                              className="flex items-center justify-center gap-1 hover:text-neutral-700 mx-auto"
                            >
                              Bundle Total
                              {bundleSortConfig.field === 'bundle_total' && (
                                <span>{bundleSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </button>
                            <ResizeHandle colKey="bundle_total" onResizeStart={handleResizeStart} />
                          </th>
                          <th className="relative px-6 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.credit_total || 130 }}>
                            <button
                              type="button"
                              onClick={() => setBundleSortConfig(prev => ({
                                field: 'credit_total',
                                direction: prev.field === 'credit_total' && prev.direction === 'asc' ? 'desc' : 'asc'
                              }))}
                              className="flex items-center justify-center gap-1 hover:text-neutral-700 mx-auto"
                            >
                              Credit Total
                              {bundleSortConfig.field === 'credit_total' && (
                                <span>{bundleSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </button>
                            <ResizeHandle colKey="credit_total" onResizeStart={handleResizeStart} />
                          </th>
                          <th className="relative px-6 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.market || 120 }}>
                            <button
                              type="button"
                              onClick={() => setBundleSortConfig(prev => ({
                                field: 'market',
                                direction: prev.field === 'market' && prev.direction === 'asc' ? 'desc' : 'asc'
                              }))}
                              className="flex items-center justify-center gap-1 hover:text-neutral-700 mx-auto"
                            >
                              Market
                              {bundleSortConfig.field === 'market' && (
                                <span>{bundleSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </button>
                          </th>
                        </tr>
                        {/* Filter sub-header row */}
                        <tr className="bg-neutral-100 border-t border-neutral-300">
                          {/* Client - no filter */}
                          <th className="px-6 py-1.5 overflow-visible" style={{ width: columnWidths.client || 180 }}></th>

                          {/* Purchase Date Filter */}
                          <th className="px-6 py-1.5 text-center overflow-visible" style={{ width: columnWidths.purchase_date || 140 }}>
                            <div className="relative inline-flex items-center justify-center gap-1 mx-auto" ref={bundlePurchaseDateFilterRef}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!showBundlePurchaseDateFilter) {
                                    setTempBundleDateFilters(prev => ({
                                      ...prev,
                                      purchaseDate: { 
                                        start: bundleFilters.purchaseDate.start, 
                                        end: bundleFilters.purchaseDate.end 
                                      }
                                    }));
                                  }
                                  setShowBundlePurchaseDateFilter(!showBundlePurchaseDateFilter);
                                }}
                                className={`p-1 rounded transition-all ${(bundleFilters.purchaseDate.start || bundleFilters.purchaseDate.end) ? 'text-white bg-primary-500 border-2 border-primary-500 shadow-sm' : 'text-neutral-400 hover:bg-neutral-200 border-2 border-transparent'}`}
                                title="Filter by purchase date"
                              >
                                <FunnelIcon className="h-3 w-3" />
                              </button>
                              {(bundleFilters.purchaseDate.start || bundleFilters.purchaseDate.end) && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBundleFilters(prev => ({
                                      ...prev,
                                      purchaseDate: { start: null, end: null }
                                    }));
                                  }}
                                  className="p-0.5 rounded hover:bg-[#FCE8F0] text-[#AE255B] hover:text-[#AE255B] transition-colors"
                                  title="Clear purchase date filter"
                                >
                                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              )}
                              {showBundlePurchaseDateFilter && (
                                <div 
                                  className="absolute left-0 bg-white border border-neutral-300 rounded-md shadow-xl z-popover"
                                  style={{ 
                                    width: '320px', 
                                    minWidth: '320px', 
                                    maxWidth: '320px', 
                                    top: 'calc(100% + 12px)', 
                                    paddingTop: '12px',
                                    paddingBottom: '12px',
                                    paddingLeft: '12px',
                                    paddingRight: '12px'
                                  }}
                                >
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between px-1">
                                      <label className="block text-xs font-medium text-neutral-700">
                                        Purchase Date
                                      </label>
                                      <button
                                        type="button"
                                        onClick={() => setShowBundlePurchaseDateFilter(false)}
                                        className="text-xs text-neutral-600 hover:text-neutral-900"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                    <DatePicker
                                      selected={tempBundleDateFilters.purchaseDate.start}
                                      onChange={(dates) => {
                                        if (Array.isArray(dates)) {
                                          const [start, end] = dates;
                                          setTempBundleDateFilters(prev => ({
                                            ...prev,
                                            purchaseDate: { start: start || null, end: end || null }
                                          }));
                                        } else if (dates) {
                                          setTempBundleDateFilters(prev => ({
                                            ...prev,
                                            purchaseDate: { start: dates, end: null }
                                          }));
                                        } else {
                                          setTempBundleDateFilters(prev => ({
                                            ...prev,
                                            purchaseDate: { start: null, end: null }
                                          }));
                                        }
                                      }}
                                      selectsRange
                                      startDate={tempBundleDateFilters.purchaseDate.start}
                                      endDate={tempBundleDateFilters.purchaseDate.end}
                                      inline
                                      calendarClassName="!border-0 !shadow-none"
                                    />
                                    {(tempBundleDateFilters.purchaseDate.start || tempBundleDateFilters.purchaseDate.end) && (
                                      <div className="text-xs text-neutral-600 px-1 pb-1">
                                        {tempBundleDateFilters.purchaseDate.start && tempBundleDateFilters.purchaseDate.end
                                          ? `${tempBundleDateFilters.purchaseDate.start.toLocaleDateString()} - ${tempBundleDateFilters.purchaseDate.end.toLocaleDateString()}`
                                          : tempBundleDateFilters.purchaseDate.start
                                          ? `From ${tempBundleDateFilters.purchaseDate.start.toLocaleDateString()}`
                                          : tempBundleDateFilters.purchaseDate.end
                                          ? `Until ${tempBundleDateFilters.purchaseDate.end.toLocaleDateString()}`
                                          : ''}
                                      </div>
                                    )}
                                    <div className="flex gap-2 px-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setBundleFilters(prev => ({
                                            ...prev,
                                            purchaseDate: {
                                              start: tempBundleDateFilters.purchaseDate.start,
                                              end: tempBundleDateFilters.purchaseDate.end
                                            }
                                          }));
                                          setShowBundlePurchaseDateFilter(false);
                                        }}
                                        className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600"
                                      >
                                        Apply
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setTempBundleDateFilters(prev => ({
                                            ...prev,
                                            purchaseDate: { start: null, end: null }
                                          }));
                                        }}
                                        className="px-3 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-100 rounded-md hover:bg-neutral-200"
                                      >
                                        Clear
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </th>
                          
                          {/* Source Filter */}
                          <th className="px-6 py-1.5 text-center overflow-visible" style={{ width: columnWidths.source || 120 }}>
                            <div className="relative inline-flex items-center justify-center gap-1 mx-auto" ref={bundleSourceFilterRef}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowBundleSourceFilter(!showBundleSourceFilter);
                                }}
                                className={`p-1 rounded transition-all ${bundleFilters.source !== 'all' ? 'text-white bg-primary-500 border-2 border-primary-500 shadow-sm' : 'text-neutral-400 hover:bg-neutral-200 border-2 border-transparent'}`}
                                title="Filter by source"
                              >
                                <FunnelIcon className="h-3 w-3" />
                              </button>
                              {bundleFilters.source !== 'all' && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBundleFilters(prev => ({ ...prev, source: 'all' }));
                                  }}
                                  className="p-0.5 rounded hover:bg-[#FCE8F0] text-[#AE255B] hover:text-[#AE255B] transition-colors"
                                  title="Clear source filter"
                                >
                                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              )}
                              {showBundleSourceFilter && (
                                <div 
                                  className="absolute left-0 bg-white border border-neutral-300 rounded-md shadow-xl z-popover"
                                  style={{ 
                                    top: 'calc(100% + 12px)', 
                                    width: '160px',
                                    minWidth: '160px',
                                    maxWidth: '160px'
                                  }}
                                >
                                  <div className="p-2 max-h-64 overflow-y-auto">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setBundleFilters(prev => ({ ...prev, source: 'all' }));
                                        setShowBundleSourceFilter(false);
                                      }}
                                      className={`w-full text-left px-2 py-1 text-xs rounded hover:bg-neutral-100 ${bundleFilters.source === 'all' ? 'bg-primary-50 text-primary-500 font-medium' : 'text-neutral-700'}`}
                                    >
                                      All Sources
                                    </button>
                                    {[...new Set(bundles.map(b => b.source).filter(Boolean))].sort().map(source => (
                                      <button
                                        key={source}
                                        type="button"
                                        onClick={() => {
                                          setBundleFilters(prev => ({ ...prev, source }));
                                          setShowBundleSourceFilter(false);
                                        }}
                                        className={`w-full text-left px-2 py-1 text-xs rounded hover:bg-neutral-100 ${bundleFilters.source === source ? 'bg-primary-50 text-primary-500 font-medium' : 'text-neutral-700'}`}
                                      >
                                        {source}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </th>
                          
                          {/* Bundle Name Filter */}
                          <th className="px-6 py-1.5 text-center overflow-visible" style={{ width: columnWidths.bundle_name || 200 }}>
                            <div className="relative inline-flex items-center justify-center gap-1 mx-auto" ref={bundleNameFilterRef}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowBundleNameFilter(!showBundleNameFilter);
                                }}
                                className={`p-1 rounded transition-all ${bundleFilters.bundleName !== 'all' ? 'text-white bg-primary-500 border-2 border-primary-500 shadow-sm' : 'text-neutral-400 hover:bg-neutral-200 border-2 border-transparent'}`}
                                title="Filter by bundle name"
                              >
                                <FunnelIcon className="h-3 w-3" />
                              </button>
                              {bundleFilters.bundleName !== 'all' && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBundleFilters(prev => ({ ...prev, bundleName: 'all' }));
                                  }}
                                  className="p-0.5 rounded hover:bg-[#FCE8F0] text-[#AE255B] hover:text-[#AE255B] transition-colors"
                                  title="Clear bundle name filter"
                                >
                                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              )}
                              {showBundleNameFilter && (
                                <div 
                                  className="absolute left-0 bg-white border border-neutral-300 rounded-md shadow-xl z-popover"
                                  style={{ 
                                    top: 'calc(100% + 12px)', 
                                    width: '240px',
                                    minWidth: '240px',
                                    maxWidth: '240px'
                                  }}
                                >
                                  <div className="p-2 max-h-64 overflow-y-auto">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setBundleFilters(prev => ({ ...prev, bundleName: 'all' }));
                                        setShowBundleNameFilter(false);
                                      }}
                                      className={`w-full text-left px-2 py-1 text-xs rounded hover:bg-neutral-100 ${bundleFilters.bundleName === 'all' ? 'bg-primary-50 text-primary-500 font-medium' : 'text-neutral-700'}`}
                                    >
                                      All Bundle Names
                                    </button>
                                    {[...new Set(bundles.map(b => b.bundle_name).filter(Boolean))].sort().map(bundleName => (
                                      <button
                                        key={bundleName}
                                        type="button"
                                        onClick={() => {
                                          setBundleFilters(prev => ({ ...prev, bundleName }));
                                          setShowBundleNameFilter(false);
                                        }}
                                        className={`w-full text-left px-2 py-1 text-xs rounded hover:bg-neutral-100 ${bundleFilters.bundleName === bundleName ? 'bg-primary-50 text-primary-500 font-medium' : 'text-neutral-700'}`}
                                      >
                                        {bundleName}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </th>
                          
                          {/* Discount - no filter */}
                          <th className="px-6 py-1.5 text-center overflow-visible" style={{ width: columnWidths.discount || 100 }}></th>

                          {/* Bundle Total - no filter */}
                          <th className="px-6 py-1.5 text-center overflow-visible" style={{ width: columnWidths.bundle_total || 130 }}></th>

                          {/* Credit Total - no filter */}
                          <th className="px-6 py-1.5 text-center overflow-visible" style={{ width: columnWidths.credit_total || 130 }}></th>

                          {/* Market Filter */}
                          <th className="px-6 py-1.5 text-center overflow-visible" style={{ width: columnWidths.market || 120 }}>
                            <div className="relative inline-flex items-center justify-center gap-1 mx-auto" ref={bundleMarketFilterRef}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowBundleMarketFilter(!showBundleMarketFilter);
                                }}
                                className={`p-1 rounded transition-all ${bundleFilters.market !== 'all' ? 'text-white bg-primary-500 border-2 border-primary-500 shadow-sm' : 'text-neutral-400 hover:bg-neutral-200 border-2 border-transparent'}`}
                                title="Filter by market"
                              >
                                <FunnelIcon className="h-3 w-3" />
                              </button>
                              {bundleFilters.market !== 'all' && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBundleFilters(prev => ({ ...prev, market: 'all' }));
                                  }}
                                  className="p-0.5 rounded hover:bg-[#FCE8F0] text-[#AE255B] hover:text-[#AE255B] transition-colors"
                                  title="Clear market filter"
                                >
                                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              )}
                              {showBundleMarketFilter && (
                                <div 
                                  className="absolute left-0 bg-white border border-neutral-300 rounded-md shadow-xl z-popover"
                                  style={{ 
                                    top: 'calc(100% + 12px)', 
                                    width: '160px',
                                    minWidth: '160px',
                                    maxWidth: '160px'
                                  }}
                                >
                                  <div className="p-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setBundleFilters(prev => ({ ...prev, market: 'all' }));
                                        setShowBundleMarketFilter(false);
                                      }}
                                      className={`w-full text-left px-2 py-1 text-xs rounded hover:bg-neutral-100 ${bundleFilters.market === 'all' ? 'bg-primary-50 text-primary-500 font-medium' : 'text-neutral-700'}`}
                                    >
                                      All Markets
                                    </button>
                                    {[...new Set(bundles.map(b => b.market).filter(Boolean))].sort().map(market => (
                                      <button
                                        key={market}
                                        type="button"
                                        onClick={() => {
                                          setBundleFilters(prev => ({ ...prev, market }));
                                          setShowBundleMarketFilter(false);
                                        }}
                                        className={`w-full text-left px-2 py-1 text-xs rounded hover:bg-neutral-100 ${bundleFilters.market === market ? 'bg-primary-50 text-primary-500 font-medium' : 'text-neutral-700'}`}
                                      >
                                        {market}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-neutral-200">
                        {paginatedBundles.map((bundle, index) => (
                          <tr key={bundle.id || index} className="hover:bg-neutral-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-neutral-900">
                                {typeof bundle.first_name === 'string' ? bundle.first_name : ''} {typeof bundle.last_name === 'string' ? bundle.last_name : ''}
                              </div>
                              {bundle.email && (
                                <div className="text-xs text-neutral-500">{bundle.email}</div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900 text-center">
                              {formatDate(bundle.purchase_date)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900 text-center">
                              {typeof bundle.source === 'string' ? bundle.source : '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900 text-center">
                              {typeof bundle.bundle_name === 'string' ? bundle.bundle_name : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900 text-center">
                              {bundle.discount_percentage}%
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-neutral-900 text-center">
                              ${(bundle.bundle_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900 text-center">
                              ${(bundle.credit_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900 text-center">
                              {typeof bundle.market === 'string' ? (
                                <span className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium border ${getMarketChipColors(bundle.market)}`}>
                                  {bundle.market}
                                </span>
                              ) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {filteredBundles.length > 0 && (
                        <tfoot className="bg-neutral-50">
                          <tr>
                            <td colSpan="4" className="px-6 py-3 text-sm font-semibold text-neutral-900 text-right">
                              Totals ({filteredBundles.length} bundles):
                            </td>
                            <td className="px-6 py-3 text-sm font-semibold text-neutral-900 text-center"></td>
                            <td className="px-6 py-3 text-sm font-semibold text-neutral-900 text-center">
                              ${filteredBundles.reduce((sum, b) => sum + b.bundle_total, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-3 text-sm font-semibold text-neutral-900 text-center">
                              ${filteredBundles.reduce((sum, b) => sum + b.credit_total, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-3 text-sm font-semibold text-neutral-900 text-center"></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                    
                    {/* Pagination Controls */}
                    {totalBundles > 0 && (
                      <div className="bg-white px-4 py-3 flex flex-col sm:flex-row items-center justify-between border-t border-neutral-200 gap-4">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <label className="text-sm text-neutral-700">Rows per page:</label>
                            <select
                              value={bundlesPerPage}
                              onChange={(e) => {
                                setBundlesPerPage(Number(e.target.value));
                                setBundlesPage(1); // Reset to first page when changing page size
                              }}
                              className="rounded-md border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
                            >
                              <option value="25">25</option>
                              <option value="50">50</option>
                              <option value="75">75</option>
                              <option value="100">100</option>
                            </select>
                          </div>
                          <div className="text-sm text-neutral-700">
                            Showing {startIndex + 1} to {Math.min(endIndex, totalBundles)} of {totalBundles} bundles
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setBundlesPage(1)}
                            disabled={bundlesPage === 1}
                            className="px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            First
                          </button>
                          <button
                            type="button"
                            onClick={() => setBundlesPage(prev => Math.max(1, prev - 1))}
                            disabled={bundlesPage === 1}
                            className="px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Previous
                          </button>
                          <span className="px-3 py-1.5 text-sm font-medium text-neutral-700">
                            Page {bundlesPage} of {totalPages}
                          </span>
                          <button
                            type="button"
                            onClick={() => setBundlesPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={bundlesPage === totalPages}
                            className="px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Next
                          </button>
                          <button
                            type="button"
                            onClick={() => setBundlesPage(totalPages)}
                            disabled={bundlesPage === totalPages}
                            className="px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Last
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        
        {showCreateBundleModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
              {/* Background overlay */}
              <div
                className="fixed inset-0 bg-neutral-500 bg-opacity-75 transition-opacity"
                onClick={() => {
                  setSelectedTemplate('none');
                  setShowCreateBundleModal(false);
                }}
              ></div>

            {/* Modal panel */}
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <div className="bg-white px-6 pt-6 pb-4">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg leading-6 font-semibold text-neutral-900" id="modal-title">
                    Create Bundle
                  </h3>
                  <button
                    type="button"
                    className="text-neutral-400 hover:text-neutral-500"
                    onClick={() => {
                      setSelectedTemplate('none');
                      setShowCreateBundleModal(false);
                    }}
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Client Search */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Client <span className="text-[#DA2E72]">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={bundleForm.clientSearch || clientSearchQuery}
                        onChange={handleClientSearchInputChange}
                        placeholder="Search for client by name or email..."
                        className="w-full px-3 py-2 border border-neutral-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                      />
                      {isSearchingClients && (
                        <div className="absolute right-3 top-2.5">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-500"></div>
                        </div>
                      )}
                      {showClientSearchResults && clientSearchResults.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-neutral-300 rounded-md shadow-lg max-h-60 overflow-auto">
                          {clientSearchResults.map((client, index) => (
                            <button
                              key={client.id || index}
                              type="button"
                              onClick={() => handleClientSelect(client)}
                              className={`w-full text-left px-4 py-2 hover:bg-primary-50 ${
                                highlightedClientIndex === index ? 'bg-primary-50' : ''
                              }`}
                              onMouseEnter={() => setHighlightedClientIndex(index)}
                            >
                              <div className="font-medium text-neutral-900">
                                {client.first_name} {client.last_name}
                              </div>
                              {client.email && (
                                <div className="text-sm text-neutral-500">{client.email}</div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {bundleForm.selectedClient && (
                      <div className="mt-2 p-2 bg-primary-50 rounded-md">
                        <div className="text-sm font-medium text-primary-700">
                          Selected: {bundleForm.selectedClient.first_name} {bundleForm.selectedClient.last_name}
                        </div>
                        {bundleForm.selectedClient.email && (
                          <div className="text-xs text-primary-500">{bundleForm.selectedClient.email}</div>
                        )}
                      </div>
                    )}
                    {clientSearchError && (
                      <p className="mt-1 text-sm text-[#AE255B]">{clientSearchError}</p>
                    )}
                  </div>

                  {/* Quick Template */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Quick Template
                    </label>
                    <select
                      value={selectedTemplate}
                      onChange={(e) => handleTemplateSelect(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    >
                      {BUNDLE_TEMPLATES.map(template => (
                        <option key={template.id} value={template.id}>
                          {template.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-neutral-500">
                      Select a template to pre-fill form fields. You can still edit values after selection.
                    </p>
                  </div>

                  {/* Bundle Name */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Bundle Name <span className="text-[#DA2E72]">*</span>
                    </label>
                    <input
                      type="text"
                      value={bundleForm.bundleName}
                      onChange={(e) => setBundleForm(prev => ({ ...prev, bundleName: e.target.value }))}
                      placeholder="e.g., Black Friday 20% Off 10-Lesson Bundle - Home Group"
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>

                  {/* Number of Lessons */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Number of Lessons <span className="text-[#DA2E72]">*</span>
                    </label>
                    <input
                      type="number"
                      value={bundleForm.numberOfLessons}
                      onChange={(e) => setBundleForm(prev => ({ ...prev, numberOfLessons: e.target.value }))}
                      placeholder="e.g., 10"
                      min="1"
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>

                  {/* Lesson Rate */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Lesson Rate ($) <span className="text-[#DA2E72]">*</span>
                    </label>
                    <input
                      type="number"
                      value={bundleForm.lessonRate}
                      onChange={(e) => setBundleForm(prev => ({ ...prev, lessonRate: e.target.value }))}
                      placeholder="e.g., 84.00"
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>

                  {/* Discount Percentage */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Discount Percentage (%)
                    </label>
                    <input
                      type="number"
                      value={bundleForm.discountPercentage}
                      onChange={(e) => setBundleForm(prev => ({ ...prev, discountPercentage: e.target.value }))}
                      placeholder="e.g., 20"
                      min="0"
                      max="100"
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>

                  {/* Payment Processing */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-3">
                      Payment Processing <span className="text-[#DA2E72]">*</span>
                    </label>
                    <div className="space-y-4">
                      {/* Auto Charge Option */}
                      <div className="relative">
                        <label className="flex items-start cursor-pointer">
                          <div className="flex items-center h-5 mt-0.5">
                            <input
                              type="radio"
                              name="paymentMethod"
                              value="auto_charge"
                              checked={bundleForm.paymentMethod === 'auto_charge'}
                              onChange={(e) => setBundleForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
                              className="h-4 w-4 text-primary-500 focus:ring-primary-500 border-neutral-300"
                            />
                          </div>
                          <div className="ml-3 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-neutral-900">Auto Charge (Recommended)</span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#E8F8ED] text-[#2A9147]">
                                Default
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-neutral-600">
                              TutorCruncher will automatically charge the client's card on file after the deferral period (minimum ~3 hours).
                            </p>
                            <div className="mt-2 p-2 bg-[#E8FBFF] rounded-md border border-[#50C8DF]/30">
                              <p className="text-xs font-medium text-[#3BA8BD]">
                                Impact: Credit will be added to account automatically after payment processes. Client will receive email notification when charged.
                              </p>
                            </div>
                          </div>
                        </label>
                      </div>

                      {/* Mark as Paid (Manual Payment) Option */}
                      <div className="relative">
                        <label className="flex items-start cursor-pointer">
                          <div className="flex items-center h-5 mt-0.5">
                            <input
                              type="radio"
                              name="paymentMethod"
                              value="cash"
                              checked={bundleForm.paymentMethod === 'cash'}
                              onChange={(e) => setBundleForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
                              className="h-4 w-4 text-primary-500 focus:ring-primary-500 border-neutral-300"
                            />
                          </div>
                          <div className="ml-3 flex-1">
                            <span className="text-sm font-medium text-neutral-900">Mark as Paid (Manual Payment)</span>
                            <p className="mt-1 text-sm text-neutral-600">
                              Immediately add credit to account without charging card. Use when payment was received via cash, check, or other manual method.
                            </p>
                            <div className="mt-2 p-2 bg-[#FEF4E8] rounded-md border border-[#C77A26]/30">
                              <p className="text-xs font-medium text-[#C77A26]">
                                Impact: Credit added immediately. No card charge. You must process payment separately (cash, check, external payment, etc.).
                              </p>
                            </div>
                          </div>
                        </label>
                      </div>

                      {/* Send Payment Request Option */}
                      <div className="relative">
                        <label className="flex items-start cursor-pointer">
                          <div className="flex items-center h-5 mt-0.5">
                            <input
                              type="radio"
                              name="paymentMethod"
                              value="send_request"
                              checked={bundleForm.paymentMethod === 'send_request'}
                              onChange={(e) => setBundleForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
                              className="h-4 w-4 text-primary-500 focus:ring-primary-500 border-neutral-300"
                            />
                          </div>
                          <div className="ml-3 flex-1">
                            <span className="text-sm font-medium text-neutral-900">Send Payment Request</span>
                            <p className="mt-1 text-sm text-neutral-600">
                              Create credit request and send email to client. Client will pay manually through their TutorCruncher account.
                            </p>
                            <div className="mt-2 p-2 bg-primary-50 rounded-md border border-primary-200">
                              <p className="text-xs font-medium text-primary-700">
                                Impact: Client receives email with payment link. Credit added only after client completes payment. No automatic charge.
                              </p>
                            </div>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white px-6 py-4 border-t border-neutral-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTemplate('none');
                    setShowCreateBundleModal(false);
                  }}
                  className="inline-flex justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-primary-500 shadow-sm ring-1 ring-inset ring-neutral-300 hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateBundle}
                  disabled={isCreatingBundle}
                  className="inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-500 text-sm font-semibold text-white hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingBundle ? 'Creating...' : 'Create Bundle'}
                </button>
              </div>
            </div>
            </div>
          </div>
        )}
    </div>
  );
}
