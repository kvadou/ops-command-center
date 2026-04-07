import React, { useState, useEffect, useMemo } from 'react';
import { XMarkIcon, ArrowDownTrayIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { DateTime } from 'luxon';

/**
 * MetricDrilldownModal Component
 * Displays underlying data for Executive Reports metrics
 * Allows searching, filtering, and CSV export
 */
export default function MetricDrilldownModal({
  open,
  onClose,
  metricKey,
  metricLabel,
  segment,
  dateRange,
  currentValue
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Clear state when modal closes or parameters change
  useEffect(() => {
    if (!open) {
      setData(null);
      setError(null);
      setSearchTerm('');
    }
  }, [open]);

  // Fetch drill-down data when modal opens
  useEffect(() => {
    if (open && metricKey && segment && dateRange) {
      // Reset state before fetching
      setData(null);
      setError(null);
      setSearchTerm('');
      fetchDrilldownData();
    }
  }, [open, metricKey, segment, dateRange]);

  const fetchDrilldownData = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        metric: metricKey,
        segment: segment,
        startDate: dateRange.start,
        endDate: dateRange.end
      });

      const response = await axios.get(`/api/reports/executive-reports/drilldown?${params}`, {
        withCredentials: true
      });

      setData(response.data);
    } catch (err) {
      console.error('Error fetching drill-down data:', err);
      setError(err.response?.data?.error || err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Filter data based on search term
  const filteredData = useMemo(() => {
    if (!data?.data || !searchTerm) return data?.data || [];

    const term = searchTerm.toLowerCase();
    return data.data.filter(row => {
      return Object.values(row).some(value => {
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(term);
      });
    });
  }, [data, searchTerm]);

  // Format cell value based on column type
  const formatCellValue = (value, column) => {
    if (value === null || value === undefined) return '-';

    switch (column.type) {
      case 'date':
        try {
          const dt = DateTime.fromISO(value);
          return dt.isValid ? dt.toFormat('MM/dd/yyyy') : value;
        } catch {
          return value;
        }

      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 2
        }).format(value);

      case 'number':
        return new Intl.NumberFormat('en-US', {
          maximumFractionDigits: 2
        }).format(value);

      case 'array':
        return Array.isArray(value) ? value.join(', ') : value;

      case 'appointment_link':
        return (
          <a
            href={`https://account.acmeops.com/cal/appointments/${value}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-600 hover:text-purple-700 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            View
          </a>
        );

      case 'contractor_link':
        return value;

      case 'client_link':
        return value;

      case 'invoice_link':
        return (
          <a
            href={`https://account.acmeops.com/invoices/${value}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-600 hover:text-purple-700 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            View
          </a>
        );

      case 'proforma_invoice_link':
        return (
          <a
            href={`https://account.acmeops.com/accounting/proforma-invoices/${value}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-600 hover:text-purple-700 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            View
          </a>
        );

      case 'school_link':
        return (
          <a
            href={`/school-partners/${value}?tab=schedule`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-600 hover:text-purple-700 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Dashboard
          </a>
        );

      default:
        return value;
    }
  };

  // Render cell with link if applicable
  const renderCell = (row, column) => {
    const value = row[column.key];

    // Handle linked cells (contractor_link, client_link)
    if (column.type === 'contractor_link' && column.idKey && row[column.idKey]) {
      return (
        <a
          href={`https://account.acmeops.com/contractors/${row[column.idKey]}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-600 hover:text-purple-700 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {value || '-'}
        </a>
      );
    }

    if (column.type === 'client_link' && column.idKey && row[column.idKey]) {
      return (
        <a
          href={`https://account.acmeops.com/clients/${row[column.idKey]}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-600 hover:text-purple-700 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {value || '-'}
        </a>
      );
    }

    return formatCellValue(value, column);
  };

  // Export to CSV
  const exportToCSV = () => {
    if (!data?.columns || !filteredData.length) return;

    // Create CSV headers
    const headers = data.columns.map(col => col.label);

    // Create CSV rows
    const rows = filteredData.map(row => {
      return data.columns.map(col => {
        const value = row[col.key];
        if (value === null || value === undefined) return '';

        // Format dates for CSV
        if (col.type === 'date') {
          try {
            const dt = DateTime.fromISO(value);
            return dt.isValid ? dt.toFormat('yyyy-MM-dd') : value;
          } catch {
            return value;
          }
        }

        // Format arrays
        if (col.type === 'array') {
          return Array.isArray(value) ? value.join('; ') : value;
        }

        // Handle link columns - export the raw ID
        if (col.type === 'appointment_link' || col.type === 'invoice_link' || col.type === 'proforma_invoice_link' || col.type === 'school_link') {
          return value;
        }

        // Escape quotes in text
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }

        return value;
      });
    });

    // Combine headers and rows
    const csvContent = [headers, ...rows]
      .map(row => row.join(','))
      .join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${metricKey}_${segment}_${dateRange.start}_to_${dateRange.end}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Get segment display name
  const getSegmentDisplayName = (seg) => {
    const names = {
      home: 'Home Lessons',
      online: 'Online Lessons',
      schools: 'Schools',
      club: 'Club'
    };
    return names[seg] || seg;
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] min-h-[500px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 flex-shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900">
              {metricLabel} Details - {getSegmentDisplayName(segment)}
            </h2>
            <p className="text-sm text-neutral-500 mt-1">
              {dateRange.start} to {dateRange.end}
              {currentValue !== undefined && (
                <span className="ml-2 text-purple-600 font-medium">
                  (Total: {typeof currentValue === 'number' ? currentValue.toLocaleString() : currentValue})
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Search and Export */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 flex-shrink-0">
          <div className="relative flex-1 max-w-md">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-neutral-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm"
            />
          </div>
          {filteredData.length > 0 && (
            <button
              onClick={exportToCSV}
              className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors ml-4"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              <span className="text-sm font-medium">Export CSV</span>
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
              <span className="ml-3 text-neutral-600">Loading data...</span>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error}</p>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-neutral-500">
                {searchTerm ? 'No results match your search.' : 'No data available for this metric.'}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200">
                    {data.columns.map((column) => (
                      <th
                        key={column.key}
                        className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider whitespace-nowrap"
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {filteredData.map((row, index) => (
                    <tr key={index} className="hover:bg-neutral-50 transition-colors">
                      {data.columns.map((column) => (
                        <td
                          key={column.key}
                          className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap"
                        >
                          {renderCell(row, column)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-200 bg-neutral-50 flex-shrink-0">
          <div className="text-sm text-neutral-500">
            Showing {filteredData.length} of {data?.data?.length || 0} results
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 transition-colors text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
