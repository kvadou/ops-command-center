import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MagnifyingGlassIcon, ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/outline';

function MindBodyDataPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState('date');
  const [sortDirection, setSortDirection] = useState('DESC');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [filters, setFilters] = useState({
    staff_paid: '',
    lesson_type: '',
    staff: '',
    late_cancel: '',
    no_show: '',
    payment_method: '',
    visit_service_category: '',
    dashboard_category: '',
    focus: '',
    location: '',
    client_id: '',
    date_from: '',
    date_to: '',
  });
  const [filterOptions, setFilterOptions] = useState({
    staff_paid: [],
    lesson_type: [],
    staff: [],
    late_cancel: [],
    no_show: [],
    payment_method: [],
    visit_service_category: [],
    dashboard_category: [],
    focus: [],
    location: [],
  });
  const [showFilters, setShowFilters] = useState(false);
  const [stats, setStats] = useState(null);

  const limit = 100;

  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit,
        search: searchTerm,
        sortBy: sortColumn,
        sortOrder: sortDirection,
        ...filters,
      };

      // Remove empty filters
      Object.keys(params).forEach(key => {
        if (params[key] === '' || params[key] === null) {
          delete params[key];
        }
      });

      const response = await axios.get('/api/mindbody', {
        params,
        withCredentials: true,
      });

      if (response.data.success) {
        setData(response.data.data);
        setTotalPages(response.data.pagination.totalPages);
        setTotalRecords(response.data.pagination.total);
      }
    } catch (error) {
      console.error('Error fetching mindbody data:', error.response?.data || error.message || error);
      if (error.response?.status === 401) {
        console.error('Authentication required');
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch filter options
  const fetchFilterOptions = async () => {
    try {
      const fields = [
        'staff_paid', 'lesson_type', 'staff', 'late_cancel', 'no_show',
        'payment_method', 'visit_service_category', 'dashboard_category',
        'focus', 'location'
      ];
      
      for (const field of fields) {
        try {
          const response = await axios.get(`/api/mindbody/filters?field=${field}`, {
            withCredentials: true,
          });
          if (response.data?.success) {
            setFilterOptions(prev => ({
              ...prev,
              [field]: response.data.values || [],
            }));
          }
        } catch (fieldError) {
          // Silently fail for individual filter fields
          console.warn(`Error fetching filter for ${field}:`, fieldError.response?.data || fieldError.message);
        }
      }
    } catch (error) {
      console.error('Error fetching filter options:', error.response?.data || error.message || error);
    }
  };

  // Fetch stats
  const fetchStats = async () => {
    try {
      const response = await axios.get('/api/mindbody/stats', {
        withCredentials: true,
      });
      if (response.data?.success) {
        setStats(response.data.stats);
      }
    } catch (error) {
      console.error('Error fetching stats:', error.response?.data || error.message || error);
    }
  };

  useEffect(() => {
    fetchData();
    fetchFilterOptions();
    fetchStats();
  }, [page, sortColumn, sortDirection]);

  useEffect(() => {
    // Debounce search
    const timer = setTimeout(() => {
      if (page === 1) {
        fetchData();
      } else {
        setPage(1);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    // Reset to page 1 when filters change
    if (page === 1) {
      fetchData();
    } else {
      setPage(1);
    }
  }, [filters]);

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortColumn(column);
      setSortDirection('ASC');
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const clearFilters = () => {
    setFilters({
      staff_paid: '',
      lesson_type: '',
      staff: '',
      late_cancel: '',
      no_show: '',
      payment_method: '',
      visit_service_category: '',
      dashboard_category: '',
      focus: '',
      location: '',
      client_id: '',
      date_from: '',
      date_to: '',
    });
    setSearchTerm('');
  };

  const formatCurrency = (value) => {
    if (!value || value === '$0.00' || value === '-') return '-';
    if (typeof value === 'string') {
      const cleaned = value.replace(/[$,]/g, '');
      const num = parseFloat(cleaned);
      if (isNaN(num)) return value;
      return `$${num.toFixed(2)}`;
    }
    return `$${parseFloat(value).toFixed(2)}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const formatTime = (timeString) => {
    if (!timeString) return '-';
    return timeString;
  };

  const getSortIcon = (column) => {
    if (sortColumn !== column) return null;
    return sortDirection === 'ASC' ? (
      <ArrowUpIcon className="h-4 w-4 inline ml-1" />
    ) : (
      <ArrowDownIcon className="h-4 w-4 inline ml-1" />
    );
  };

  const activeFiltersCount = Object.values(filters).filter(v => v !== '').length;

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      {stats && (
        <div className="flex items-center justify-end">
          <div className="text-sm text-neutral-600">
            Total Records: {parseInt(stats.total_records || 0).toLocaleString()} | 
            Unique Staff: {parseInt(stats.unique_staff || 0)} | 
            Unique Clients: {parseInt(stats.unique_clients || 0)}
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white border border-neutral-200 rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-neutral-400" />
            <input
              type="text"
              placeholder="Search clients, staff, locations, lesson types..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-md focus:ring-2 focus:ring-brand-purple focus:border-transparent"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 rounded-md border ${
              showFilters || activeFiltersCount > 0
                ? 'bg-brand-purple text-white border-brand-purple'
                : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
            }`}
          >
            Filters {activeFiltersCount > 0 && `(${activeFiltersCount})`}
          </button>
          {activeFiltersCount > 0 && (
            <button
              onClick={clearFilters}
              className="px-4 py-2 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-neutral-200">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Staff Paid</label>
              <select
                value={filters.staff_paid}
                onChange={(e) => handleFilterChange('staff_paid', e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md"
              >
                <option value="">All</option>
                {filterOptions.staff_paid.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Lesson Type</label>
              <select
                value={filters.lesson_type}
                onChange={(e) => handleFilterChange('lesson_type', e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md"
              >
                <option value="">All</option>
                {filterOptions.lesson_type.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Staff</label>
              <select
                value={filters.staff}
                onChange={(e) => handleFilterChange('staff', e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md"
              >
                <option value="">All</option>
                {filterOptions.staff.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Late Cancel</label>
              <select
                value={filters.late_cancel}
                onChange={(e) => handleFilterChange('late_cancel', e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md"
              >
                <option value="">All</option>
                {filterOptions.late_cancel.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">No-Show</label>
              <select
                value={filters.no_show}
                onChange={(e) => handleFilterChange('no_show', e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md"
              >
                <option value="">All</option>
                {filterOptions.no_show.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Payment Method</label>
              <select
                value={filters.payment_method}
                onChange={(e) => handleFilterChange('payment_method', e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md"
              >
                <option value="">All</option>
                {filterOptions.payment_method.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Service Category</label>
              <select
                value={filters.visit_service_category}
                onChange={(e) => handleFilterChange('visit_service_category', e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md"
              >
                <option value="">All</option>
                {filterOptions.visit_service_category.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Dashboard Category</label>
              <select
                value={filters.dashboard_category}
                onChange={(e) => handleFilterChange('dashboard_category', e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md"
              >
                <option value="">All</option>
                {filterOptions.dashboard_category.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Focus</label>
              <select
                value={filters.focus}
                onChange={(e) => handleFilterChange('focus', e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md"
              >
                <option value="">All</option>
                {filterOptions.focus.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Location</label>
              <select
                value={filters.location}
                onChange={(e) => handleFilterChange('location', e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md"
              >
                <option value="">All</option>
                {filterOptions.location.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Client ID</label>
              <input
                type="text"
                value={filters.client_id}
                onChange={(e) => handleFilterChange('client_id', e.target.value)}
                placeholder="Client ID"
                className="w-full px-3 py-2 border border-neutral-300 rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Date From</label>
              <input
                type="date"
                value={filters.date_from}
                onChange={(e) => handleFilterChange('date_from', e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Date To</label>
              <input
                type="date"
                value={filters.date_to}
                onChange={(e) => handleFilterChange('date_to', e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md"
              />
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-neutral-500">Loading...</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-neutral-50">
                  <tr>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                      onClick={() => handleSort('date')}
                    >
                      Date {getSortIcon('date')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                      onClick={() => handleSort('time')}
                    >
                      Time {getSortIcon('time')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                      onClick={() => handleSort('client')}
                    >
                      Client {getSortIcon('client')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                      onClick={() => handleSort('lesson_type')}
                    >
                      Lesson Type {getSortIcon('lesson_type')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                      onClick={() => handleSort('staff')}
                    >
                      Staff {getSortIcon('staff')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                      onClick={() => handleSort('location')}
                    >
                      Location {getSortIcon('location')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                      onClick={() => handleSort('rev_per_visit')}
                    >
                      Revenue {getSortIcon('rev_per_visit')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                      onClick={() => handleSort('class_size')}
                    >
                      Class Size {getSortIcon('class_size')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                      onClick={() => handleSort('hrs')}
                    >
                      Hours {getSortIcon('hrs')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                      onClick={() => handleSort('late_cancel')}
                    >
                      Late Cancel {getSortIcon('late_cancel')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                      onClick={() => handleSort('no_show')}
                    >
                      No-Show {getSortIcon('no_show')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-neutral-200">
                  {data.map((row) => (
                    <tr key={row.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-900">
                        {formatDate(row.date)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-900">
                        {formatTime(row.time)}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-900">
                        <div>{row.client || '-'}</div>
                        {row.client_id && (
                          <div className="text-xs text-neutral-500">ID: {row.client_id}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-900">
                        {row.lesson_type || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-900">
                        {row.staff || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-900">
                        {row.location || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-900">
                        {formatCurrency(row.rev_per_visit)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-900">
                        {row.class_size || 0}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-900">
                        {row.hrs ? parseFloat(row.hrs).toFixed(2) : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          row.late_cancel === 'Yes' 
                            ? 'bg-red-100 text-red-800'
                            : 'bg-neutral-100 text-neutral-800'
                        }`}>
                          {row.late_cancel || 'No'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          row.no_show === 'Yes' 
                            ? 'bg-red-100 text-red-800'
                            : 'bg-neutral-100 text-neutral-800'
                        }`}>
                          {row.no_show || 'No'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="bg-neutral-50 px-4 py-3 flex items-center justify-between border-t border-neutral-200">
              <div className="text-sm text-neutral-700">
                Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, totalRecords)} of {totalRecords} results
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 border border-neutral-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-100"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm text-neutral-700">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 border border-neutral-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-100"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default MindBodyDataPage;

