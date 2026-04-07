import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { DateTime } from 'luxon';
import {
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  AdjustmentsHorizontalIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useResizableColumns, ResizeHandle } from '../ClientConversion/useResizableColumns';
import axios from 'axios';

function formatCellValue(value, column) {
  if (value === null || value === undefined) return '—';
  if (column.type === 'date' && value) {
    const dt = DateTime.fromISO(value);
    return dt.isValid ? dt.toFormat('MMM d, yyyy h:mm a') : String(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// Renders a cell value — linked if the column has a linkColumn config
function CellValue({ value, column, linkColumns }) {
  const formatted = formatCellValue(value, column);
  if (formatted === '—') return <span className="text-neutral-400">—</span>;

  const link = linkColumns && linkColumns[column.key];
  if (link && value) {
    // Link to the detail page if a route exists, otherwise link to Data Center entity view
    if (link.route) {
      return (
        <Link
          to={`${link.route}/${value}`}
          className="text-[#6A469D] hover:text-[#2D2F8E] hover:underline font-medium"
          onClick={(e) => e.stopPropagation()}
        >
          {formatted}
        </Link>
      );
    }
    return (
      <Link
        to={`/analytics/data-center/${link.entity}?search=${encodeURIComponent(value)}`}
        className="text-[#6A469D] hover:text-[#2D2F8E] hover:underline font-medium"
        onClick={(e) => e.stopPropagation()}
      >
        {formatted}
      </Link>
    );
  }

  return <>{formatted}</>;
}

export default function DataCenterTable() {
  const { entity } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState({ rows: [], totalCount: 0, totalPages: 0, columns: [], entityLabel: '', linkColumns: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState('ASC');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [exporting, setExporting] = useState(false);

  const columnPickerRef = useRef(null);
  const savedFilterRef = useRef(null);

  // Column visibility — persisted per entity
  const [hiddenColumns, setHiddenColumns] = useState(() => {
    try {
      const saved = localStorage.getItem(`dc-hidden-cols-${entity}`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Saved filters (localStorage-based)
  const [savedFilters, setSavedFilters] = useState(() => {
    try {
      const saved = localStorage.getItem(`dc-saved-filters-${entity}`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [showSavedFilters, setShowSavedFilters] = useState(false);
  const [filterName, setFilterName] = useState('');

  const { columnWidths, handleResizeStart } = useResizableColumns(`dc-col-widths-${entity}`);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target)) {
        setShowColumnPicker(false);
      }
      if (savedFilterRef.current && !savedFilterRef.current.contains(e.target)) {
        setShowSavedFilters(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const saveCurrentFilter = () => {
    if (!filterName.trim()) return;
    const newFilter = {
      name: filterName.trim(),
      search: debouncedSearch,
      dateFrom,
      dateTo,
      sortBy,
      sortDir,
      hiddenColumns,
      savedAt: new Date().toISOString(),
    };
    const updated = [...savedFilters, newFilter];
    setSavedFilters(updated);
    localStorage.setItem(`dc-saved-filters-${entity}`, JSON.stringify(updated));
    setFilterName('');
  };

  const loadFilter = (filter) => {
    setSearch(filter.search || '');
    setDateFrom(filter.dateFrom || '');
    setDateTo(filter.dateTo || '');
    setSortBy(filter.sortBy || null);
    setSortDir(filter.sortDir || 'ASC');
    if (filter.hiddenColumns) {
      setHiddenColumns(filter.hiddenColumns);
      localStorage.setItem(`dc-hidden-cols-${entity}`, JSON.stringify(filter.hiddenColumns));
    }
    setPage(1);
    setShowSavedFilters(false);
  };

  const deleteFilter = (index) => {
    const updated = savedFilters.filter((_, i) => i !== index);
    setSavedFilters(updated);
    localStorage.setItem(`dc-saved-filters-${entity}`, JSON.stringify(updated));
  };

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (sortBy) {
        params.set('sortBy', sortBy);
        params.set('sortDir', sortDir);
      }
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await axios.get(`/api/data-center/${entity}?${params}`);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, [entity, page, pageSize, sortBy, sortDir, debouncedSearch, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Reset state when entity changes
  useEffect(() => {
    setPage(1);
    setSortBy(null);
    setSortDir('ASC');
    setSearch('');
    setDebouncedSearch('');
    setDateFrom('');
    setDateTo('');
    try {
      const saved = localStorage.getItem(`dc-hidden-cols-${entity}`);
      setHiddenColumns(saved ? JSON.parse(saved) : []);
    } catch { setHiddenColumns([]); }
    try {
      const saved = localStorage.getItem(`dc-saved-filters-${entity}`);
      setSavedFilters(saved ? JSON.parse(saved) : []);
    } catch { setSavedFilters([]); }
  }, [entity]);

  const toggleColumn = (colKey) => {
    setHiddenColumns(prev => {
      const next = prev.includes(colKey)
        ? prev.filter(k => k !== colKey)
        : [...prev, colKey];
      localStorage.setItem(`dc-hidden-cols-${entity}`, JSON.stringify(next));
      return next;
    });
  };

  const handleSort = (colKey) => {
    if (sortBy === colKey) {
      setSortDir(prev => prev === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(colKey);
      setSortDir('ASC');
    }
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await axios.get(`/api/data-center/${entity}/export?${params}`, {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${data.entityLabel || entity}-export.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const visibleColumns = data.columns.filter(c => !hiddenColumns.includes(c.key));
  const startRow = (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, data.totalCount);

  return (
    <div className="max-w-[1600px] mx-auto w-full space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/analytics/data-center')}
            className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <ArrowLeftIcon className="h-5 w-5 text-neutral-600" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">
              {data.entityLabel || entity}
            </h1>
            <p className="text-sm text-neutral-500">
              {data.totalCount.toLocaleString()} records
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[#6A469D] bg-[#6A469D]/10 rounded-lg hover:bg-[#6A469D]/20 transition-colors disabled:opacity-50"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search records..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6A469D]/30 focus:border-[#6A469D]"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <XMarkIcon className="h-4 w-4 text-neutral-400 hover:text-neutral-600" />
              </button>
            )}
          </div>

          {/* Date Range */}
          {data.hasDateFilter && (
            <>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6A469D]/30 focus:border-[#6A469D]"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6A469D]/30 focus:border-[#6A469D]"
              />
            </>
          )}

          {/* Column Visibility */}
          <div className="relative" ref={columnPickerRef}>
            <button
              onClick={() => setShowColumnPicker(!showColumnPicker)}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
            >
              <AdjustmentsHorizontalIcon className="h-4 w-4 text-neutral-500" />
              <span className="text-neutral-700">Columns</span>
            </button>
            {showColumnPicker && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-neutral-200 p-2 z-50 max-h-80 overflow-y-auto">
                {data.columns.map(col => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-neutral-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={!hiddenColumns.includes(col.key)}
                      onChange={() => toggleColumn(col.key)}
                      className="rounded border-neutral-300 text-[#6A469D] focus:ring-[#6A469D]"
                    />
                    <span className="text-sm text-neutral-700">{col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Saved Filters */}
          <div className="relative" ref={savedFilterRef}>
            <button
              onClick={() => setShowSavedFilters(!showSavedFilters)}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
            >
              <svg className="h-4 w-4 text-neutral-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
              </svg>
              <span className="text-neutral-700">Views</span>
              {savedFilters.length > 0 && (
                <span className="bg-[#6A469D]/10 text-[#6A469D] text-[10px] font-medium px-1.5 rounded-full">
                  {savedFilters.length}
                </span>
              )}
            </button>
            {showSavedFilters && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-lg shadow-lg border border-neutral-200 z-50">
                {/* Save current */}
                <div className="p-2 border-b border-neutral-100">
                  <div className="flex gap-1">
                    <input
                      type="text"
                      placeholder="Save current view as..."
                      value={filterName}
                      onChange={(e) => setFilterName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveCurrentFilter()}
                      className="flex-1 px-2 py-1.5 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-[#6A469D]"
                    />
                    <button
                      onClick={saveCurrentFilter}
                      disabled={!filterName.trim()}
                      className="px-2 py-1.5 text-sm font-medium text-white bg-[#6A469D] rounded hover:bg-[#2D2F8E] disabled:opacity-40 transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </div>
                {/* Saved list */}
                <div className="max-h-60 overflow-y-auto">
                  {savedFilters.length === 0 ? (
                    <p className="p-3 text-sm text-neutral-400 text-center">No saved views yet</p>
                  ) : (
                    savedFilters.map((f, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 hover:bg-neutral-50 group">
                        <button
                          onClick={() => loadFilter(f)}
                          className="text-sm text-neutral-700 hover:text-[#6A469D] text-left flex-1 truncate"
                        >
                          {f.name}
                        </button>
                        <button
                          onClick={() => deleteFilter(i)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-neutral-200 rounded transition-opacity"
                        >
                          <XMarkIcon className="h-3.5 w-3.5 text-neutral-400" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-[#DA2E72]/10 border border-[#DA2E72]/20 rounded-lg p-3 text-sm text-[#DA2E72]">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50/50">
                {visibleColumns.map(col => (
                  <th
                    key={col.key}
                    className="relative px-3 py-2.5 text-left"
                    style={{ width: columnWidths[col.key] || col.width || 120 }}
                  >
                    {col.sortable ? (
                      <button
                        onClick={() => handleSort(col.key)}
                        className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500 hover:text-neutral-900 transition-colors"
                      >
                        {col.label}
                        {sortBy === col.key ? (
                          sortDir === 'ASC' ? (
                            <ChevronUpIcon className="h-3 w-3 text-[#6A469D]" />
                          ) : (
                            <ChevronDownIcon className="h-3 w-3 text-[#6A469D]" />
                          )
                        ) : (
                          <span className="h-3 w-3" />
                        )}
                      </button>
                    ) : (
                      <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                        {col.label}
                      </span>
                    )}
                    <ResizeHandle colKey={col.key} onResizeStart={handleResizeStart} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b border-neutral-50">
                    {visibleColumns.map(col => (
                      <td key={col.key} className="px-3 py-2.5">
                        <div className="h-4 bg-neutral-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data.rows.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="px-3 py-12 text-center text-sm text-neutral-500">
                    No records found
                  </td>
                </tr>
              ) : (
                data.rows.map((row, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors"
                  >
                    {visibleColumns.map(col => (
                      <td
                        key={col.key}
                        className="px-3 py-2 text-sm text-neutral-700 truncate"
                        title={formatCellValue(row[col.key], col)}
                      >
                        <CellValue value={row[col.key]} column={col} linkColumns={data.linkColumns} />
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-neutral-100">
          <div className="text-sm text-neutral-500">
            {data.totalCount > 0 ? (
              <>Showing {startRow}–{endRow} of {data.totalCount.toLocaleString()}</>
            ) : (
              'No results'
            )}
          </div>

          <div className="flex items-center gap-3">
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(parseInt(e.target.value)); setPage(1); }}
              className="text-sm border border-neutral-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#6A469D]/30"
            >
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeftIcon className="h-4 w-4 text-neutral-600" />
              </button>
              <span className="text-sm text-neutral-700 min-w-[80px] text-center">
                Page {page} of {data.totalPages || 1}
              </span>
              <button
                onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
                className="p-1.5 rounded-lg hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRightIcon className="h-4 w-4 text-neutral-600" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
