import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Tooltip,
  CircularProgress
} from '@mui/material';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  AcademicCapIcon,
  ViewColumnsIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import axios from 'axios';
import { useToast } from '../hooks/useToast';

// Format a date string to readable form (e.g., "Feb 20, 2026")
function formatDate(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return null;
  }
}

// Metrics card component
function MetricCard({ label, value, tone, children }) {
  const toneClasses = {
    default: 'text-neutral-900',
    success: 'text-[#2A9147]',
    warning: 'text-[#F79A30]',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 flex flex-col justify-center min-h-[88px]">
      <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">{label}</p>
      {children ? (
        children
      ) : (
        <p className={`text-2xl font-bold ${toneClasses[tone] || toneClasses.default}`}>
          {value !== null && value !== undefined ? value.toLocaleString() : '--'}
        </p>
      )}
    </div>
  );
}

// Band distribution stacked bar
function BandDistributionBar({ bandDistribution }) {
  if (!bandDistribution || bandDistribution.length === 0) {
    return <span className="text-sm text-neutral-400">No data</span>;
  }

  const total = bandDistribution.reduce((sum, b) => sum + (b.student_count || 0), 0);
  if (total === 0) {
    return <span className="text-sm text-neutral-400">No data</span>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex rounded-full h-3 overflow-hidden bg-neutral-100">
        {bandDistribution.map((band, i) => {
          const pct = (band.student_count / total) * 100;
          if (pct <= 0) return null;
          return (
            <Tooltip
              key={band.module_number ?? i}
              title={`${band.band_name}: ${band.student_count} students (${Math.round(pct)}%)`}
              arrow
            >
              <div
                style={{
                  width: `${pct}%`,
                  backgroundColor: band.band_color || '#9CA3AF',
                  minWidth: pct > 0 ? '4px' : 0,
                }}
                className="h-full transition-all duration-300"
              />
            </Tooltip>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {bandDistribution.filter(b => b.student_count > 0).map((band, i) => (
          <span key={band.module_number ?? i} className="flex items-center gap-1 text-[10px] text-neutral-500">
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: band.band_color || '#9CA3AF' }}
            />
            {band.band_name}
          </span>
        ))}
      </div>
    </div>
  );
}

const StudentManagement = () => {
  const toast = useToast();
  const navigate = useNavigate();

  // Data state
  const [students, setStudents] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [bandDistribution, setBandDistribution] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });

  // UI state
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedBand, setSelectedBand] = useState(null); // null = All
  const [page, setPage] = useState(0); // MUI TablePagination is 0-indexed
  const [rowsPerPage, setRowsPerPage] = useState(50);

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    student: true, band: true, progress: true,
    paying_client: true, lessons: true, last_lesson: true,
  });
  const [columnsMenuAnchor, setColumnsMenuAnchor] = useState(null);

  // Resizable columns state - persisted in localStorage
  const colStorageKey = 'columnWidths_students';
  const [columnWidths, setColumnWidths] = useState(() => {
    try {
      const saved = localStorage.getItem(colStorageKey);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [resizing, setResizing] = useState(null);

  useEffect(() => {
    if (Object.keys(columnWidths).length > 0) {
      localStorage.setItem(colStorageKey, JSON.stringify(columnWidths));
    }
  }, [columnWidths]);

  const handleResizeStart = (e, colKey) => {
    e.preventDefault();
    e.stopPropagation();
    const th = e.target.closest('th');
    setResizing({ colKey, startX: e.clientX, startWidth: th.offsetWidth });
  };

  useEffect(() => {
    if (!resizing) return;
    const handleMouseMove = (e) => {
      const diff = e.clientX - resizing.startX;
      const newWidth = Math.max(80, resizing.startWidth + diff);
      setColumnWidths(prev => ({ ...prev, [resizing.colKey]: newWidth }));
    };
    const handleMouseUp = () => setResizing(null);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing]);

  // Debounce timer ref
  const debounceRef = useRef(null);

  // Debounce search input
  const handleSearchChange = useCallback((e) => {
    const val = e.target.value;
    setSearchInput(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(0);
    }, 300);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Fetch students
  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: page + 1, // API is 1-indexed
        limit: rowsPerPage,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (selectedBand !== null) params.band = selectedBand;

      const response = await axios.get('/api/student-management', {
        params,
        withCredentials: true,
      });

      const data = response.data;
      setStudents(data.students || []);
      setPagination(data.pagination || { page: 1, limit: rowsPerPage, total: 0, totalPages: 0 });
      setMetrics(data.metrics || null);
      setBandDistribution(data.bandDistribution || []);
    } catch (err) {
      console.error('Error fetching students:', err);
      toast.error('Failed to load students. Please try again.');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, rowsPerPage, debouncedSearch, selectedBand]);

  // Re-fetch when filters change
  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // Band filter click
  const handleBandClick = (moduleNumber) => {
    setSelectedBand(moduleNumber);
    setPage(0);
  };

  // Column definitions
  const studentColumns = [
    { key: 'student', label: 'Student' },
    { key: 'band', label: 'Band' },
    { key: 'progress', label: 'Progress' },
    { key: 'paying_client', label: 'Paying Client' },
    { key: 'lessons', label: 'Lessons' },
    { key: 'last_lesson', label: 'Last Lesson' },
  ];

  // Render student row
  const renderStudentRow = (student) => {
    const band = student.band;
    const hasBand = band && band.module > 0;
    const formattedDate = formatDate(student.last_lesson_date);
    const displayName = `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Unknown';

    return (
      <tr
        key={student.recipient_id}
        className="hover:bg-neutral-50 transition-colors cursor-pointer border-b border-neutral-100"
        onClick={() => navigate(`/students/${student.recipient_id}`)}
      >
        {/* Student name with avatar */}
        {visibleColumns.student && (
          <td className="px-3 py-2.5">
            <div className="flex items-center">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold mr-3">
                {displayName[0] || 'S'}
              </div>
              <div>
                <div className="text-sm font-medium text-neutral-900">
                  {displayName}
                </div>
              </div>
            </div>
          </td>
        )}

        {/* Band */}
        {visibleColumns.band && (
          <td className="px-3 py-2.5">
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
              style={{
                backgroundColor: hasBand ? band.color : '#9CA3AF',
              }}
            >
              {hasBand ? band.name : 'No Band'}
            </span>
          </td>
        )}

        {/* Progress */}
        {visibleColumns.progress && (
          <td className="px-3 py-2.5">
            {hasBand ? (
              <div className="flex flex-col gap-0.5 min-w-[120px] max-w-[200px]">
                <span className="text-xs text-neutral-700 font-medium">
                  {band.displayName || `Module ${band.module}`}: {student.progress}
                </span>
                <div className="bg-neutral-200 rounded-full h-1.5">
                  <div
                    className="rounded-full h-1.5 transition-all duration-300"
                    style={{
                      width: `${student.total_in_module > 0 ? Math.min((student.lessons_in_module / student.total_in_module) * 100, 100) : 0}%`,
                      backgroundColor: band.color,
                    }}
                  />
                </div>
              </div>
            ) : (
              <span className="text-neutral-400">&mdash;</span>
            )}
          </td>
        )}

        {/* Paying Client */}
        {visibleColumns.paying_client && (
          <td className="px-3 py-2.5 text-sm text-neutral-700">
            {student.client_first_name} {student.client_last_name}
          </td>
        )}

        {/* Lessons count */}
        {visibleColumns.lessons && (
          <td className="px-3 py-2.5 text-sm text-neutral-700">
            {student.total_lessons_completed ?? 0}
          </td>
        )}

        {/* Last Lesson */}
        {visibleColumns.last_lesson && (
          <td className="px-3 py-2.5">
            {formattedDate ? (
              <span className="text-sm text-neutral-700">{formattedDate}</span>
            ) : (
              <span className="text-neutral-400">&mdash;</span>
            )}
          </td>
        )}
      </tr>
    );
  };

  // Main tabs (students only has one for now)
  const PAGE_TABS = [
    { id: 0, label: 'Students' },
  ];

  return (
    <div>
      {/* Top-level page tabs — matches ClientManagement */}
      <div className="border-b border-neutral-200 bg-white px-4 sm:px-6 lg:px-8">
        <nav className="flex gap-6 -mb-px">
          {PAGE_TABS.map(tab => (
            <button
              key={tab.id}
              className="px-1 py-3 text-sm font-medium border-b-2 border-brand-purple text-brand-purple"
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 pt-4">
        {/* Metrics Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <MetricCard
            label="Total Students"
            value={metrics?.totalStudents}
            tone="default"
          />
          <MetricCard
            label="Active Students"
            value={metrics?.activeStudents}
            tone="success"
          />
          <MetricCard label="Band Distribution" tone="default">
            <BandDistributionBar bandDistribution={bandDistribution} />
          </MetricCard>
          <MetricCard
            label="No Progress Yet"
            value={metrics?.noProgress}
            tone="warning"
          />
        </div>

        {/* Band filter sub-tabs — matches status tabs in ClientManagement */}
        <div className="border-b border-neutral-200 mb-4">
          <nav className="flex gap-4 -mb-px flex-wrap">
            {/* "All" tab */}
            <button
              onClick={() => handleBandClick(null)}
              className={`inline-flex items-center gap-2 px-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                selectedBand === null
                  ? 'border-brand-purple text-brand-purple'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              }`}
            >
              All
              <span className={`text-xs tabular-nums ${
                selectedBand === null ? 'text-brand-purple' : 'text-neutral-400'
              }`}>
                {pagination.total.toLocaleString()}
              </span>
            </button>

            {/* Band color tabs */}
            {bandDistribution.map((band) => {
              const isSelected = selectedBand === band.module_number;
              return (
                <button
                  key={band.module_number}
                  onClick={() => handleBandClick(band.module_number)}
                  className={`inline-flex items-center gap-2 px-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    isSelected
                      ? 'border-brand-purple text-brand-purple'
                      : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                  }`}
                >
                  <span
                    className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: band.band_color || '#9CA3AF' }}
                  />
                  {band.band_name}
                  <span className={`text-xs tabular-nums ${
                    isSelected ? 'text-brand-purple' : 'text-neutral-400'
                  }`}>
                    {band.student_count}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Standardized Toolbar — matches ClientManagement exactly */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 mb-3">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            {/* Search input */}
            <div className="relative flex-shrink-0" style={{ width: '260px' }}>
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Search students..."
                value={searchInput}
                onChange={handleSearchChange}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            {/* Columns button */}
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors"
              onClick={(e) => setColumnsMenuAnchor(e.currentTarget)}
            >
              <ViewColumnsIcon className="h-4 w-4" />
              Columns
            </button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Row count */}
            <span className="text-sm text-neutral-500 whitespace-nowrap">
              {pagination.total.toLocaleString()} results
            </span>

            {/* Primary action */}
            <button className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-colors">
              <PlusIcon className="h-4 w-4" />
              Add student
            </button>
          </div>

          {/* Student Table */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <CircularProgress size={36} />
              <span className="ml-3 text-sm text-neutral-500">Loading students...</span>
            </div>
          ) : students.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
              <AcademicCapIcon className="h-12 w-12 mb-1" />
              <p className="text-sm">
                {debouncedSearch || selectedBand !== null
                  ? 'No students match your filters.'
                  : 'No students found.'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left table-fixed">
                  <thead>
                    <tr className="border-t border-b border-neutral-200 bg-neutral-50/50">
                      {studentColumns.filter(col => visibleColumns[col.key]).map((col) => {
                        const colWidth = columnWidths[col.key];
                        return (
                          <th
                            key={col.key}
                            className="px-3 py-2 text-[11px] font-medium text-neutral-500 uppercase tracking-wider select-none relative"
                            style={colWidth ? { width: colWidth, minWidth: '80px' } : undefined}
                          >
                            <span className="inline-flex items-center whitespace-nowrap">
                              {col.label}
                            </span>
                            {/* Resize handle */}
                            <div
                              className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize hover:bg-brand-purple/20 group z-10"
                              onMouseDown={(e) => handleResizeStart(e, col.key)}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="mx-auto w-px h-full bg-neutral-200 group-hover:bg-brand-purple/40" />
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(renderStudentRow)}
                  </tbody>
                </table>
              </div>

              {/* Pagination — matches ClientManagement */}
              <div className="flex flex-wrap items-center justify-between px-4 py-3 border-t border-neutral-200">
                <span className="text-sm text-neutral-500">
                  Showing {pagination.total === 0 ? 0 : page * rowsPerPage + 1}–{Math.min((page + 1) * rowsPerPage, pagination.total)} of {pagination.total.toLocaleString()}
                </span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 mr-4">
                    <span className="text-sm text-neutral-500">Rows per page:</span>
                    <select
                      value={rowsPerPage}
                      onChange={(e) => {
                        setRowsPerPage(parseInt(e.target.value, 10));
                        setPage(0);
                      }}
                      className="text-sm border border-neutral-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                  {(() => {
                    const totalPages = Math.ceil(pagination.total / rowsPerPage);
                    const maxButtons = 5;
                    let startPage = Math.max(0, page - Math.floor(maxButtons / 2));
                    let endPage = Math.min(totalPages, startPage + maxButtons);
                    if (endPage - startPage < maxButtons) {
                      startPage = Math.max(0, endPage - maxButtons);
                    }
                    return (
                      <div className="flex items-center gap-1">
                        <button
                          disabled={page === 0}
                          onClick={() => setPage(page - 1)}
                          className="px-2 py-1 text-sm rounded border border-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-50 transition-colors"
                        >
                          <ChevronLeftIcon className="h-4 w-4" />
                        </button>
                        {Array.from({ length: endPage - startPage }, (_, i) => startPage + i).map((p) => (
                          <button
                            key={p}
                            onClick={() => setPage(p)}
                            className={`px-2.5 py-1 text-sm rounded border transition-colors ${
                              p === page
                                ? 'bg-primary-500 text-white border-primary-500'
                                : 'border-neutral-300 hover:bg-neutral-50'
                            }`}
                          >
                            {p + 1}
                          </button>
                        ))}
                        <button
                          disabled={page >= totalPages - 1}
                          onClick={() => setPage(page + 1)}
                          className="px-2 py-1 text-sm rounded border border-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-50 transition-colors"
                        >
                          <ChevronRightIcon className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Columns visibility menu */}
        {columnsMenuAnchor && (
          <>
            <div className="fixed inset-0 z-dropdown" onClick={() => setColumnsMenuAnchor(null)} />
            <div
              className="absolute z-dropdown bg-white rounded-lg shadow-dropdown border border-neutral-200 py-1 min-w-[180px]"
              style={{
                top: columnsMenuAnchor.getBoundingClientRect().bottom + window.scrollY + 4,
                left: columnsMenuAnchor.getBoundingClientRect().left + window.scrollX,
              }}
            >
              {studentColumns.map((col) => (
                <label key={col.key} className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={visibleColumns[col.key]}
                    onChange={() => setVisibleColumns(prev => ({ ...prev, [col.key]: !prev[col.key] }))}
                    className="rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
                  />
                  {col.label}
                </label>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default StudentManagement;
