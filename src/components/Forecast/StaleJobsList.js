import React, { useState, useMemo } from 'react';
import { DateTime } from 'luxon';
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

export default function StaleJobsList({ jobs, loading, onRefresh }) {
  const [query, setQuery] = useState('');
  const [sortField, setSortField] = useState('days_since_last_lesson');
  const [sortDir, setSortDir] = useState('desc');
  const [showAll, setShowAll] = useState(false);

  // Filter and sort jobs
  const filteredJobs = useMemo(() => {
    let filtered = jobs || [];

    // Search filter
    if (query) {
      const lowerQuery = query.toLowerCase();
      filtered = filtered.filter(job =>
        (job.job_name || '').toLowerCase().includes(lowerQuery) ||
        (job.client_name || '').toLowerCase().includes(lowerQuery) ||
        (job.channel || '').toLowerCase().includes(lowerQuery) ||
        (job.market || '').toLowerCase().includes(lowerQuery)
      );
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      // Handle nulls
      if (aVal == null) aVal = sortDir === 'desc' ? -Infinity : Infinity;
      if (bVal == null) bVal = sortDir === 'desc' ? -Infinity : Infinity;

      // Handle dates
      if (sortField === 'last_lesson_date') {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }

      if (sortDir === 'desc') {
        return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
      }
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    });

    return filtered;
  }, [jobs, query, sortField, sortDir]);

  // Show limited or all
  const displayedJobs = showAll ? filteredJobs : filteredJobs.slice(0, 10);

  // Toggle sort
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // Sort header component
  const SortHeader = ({ field, children }) => (
    <th
      className="py-2 pr-4 text-xs font-medium text-neutral-600 cursor-pointer hover:text-neutral-900 select-none"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && (
          sortDir === 'desc' ? <ChevronDownIcon className="h-3 w-3" /> : <ChevronUpIcon className="h-3 w-3" />
        )}
      </div>
    </th>
  );

  // Export to CSV
  const handleExport = () => {
    if (!filteredJobs.length) return;

    const headers = ['Job Name', 'Client', 'Last Lesson', 'Days Since', 'Total Lessons', 'Channel', 'Market', 'Service ID'];
    const csvContent = [
      headers.join(','),
      ...filteredJobs.map(job => [
        `"${(job.job_name || '').replace(/"/g, '""')}"`,
        `"${(job.client_name || '').replace(/"/g, '""')}"`,
        job.last_lesson_date ? DateTime.fromISO(job.last_lesson_date).toFormat('yyyy-MM-dd') : 'Never',
        job.days_since_last_lesson || 'N/A',
        job.total_lessons || 0,
        job.channel || '',
        job.market || '',
        job.service_id || '',
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stale_jobs_${DateTime.now().toFormat('yyyy-MM-dd')}.csv`;
    a.click();
  };

  // Get severity color based on days since last lesson
  const getSeverityColor = (days) => {
    if (days == null) return 'bg-red-100 text-red-700'; // Never had a lesson
    if (days > 90) return 'bg-red-100 text-red-700';
    if (days > 60) return 'bg-orange-100 text-orange-700';
    return 'bg-amber-100 text-amber-700';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
        <span className="ml-2 text-sm text-neutral-600">Loading stale jobs...</span>
      </div>
    );
  }

  if (!jobs || jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-neutral-500">
        <div className="text-green-500 mb-2">
          <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <span className="text-sm">No stale jobs found. All jobs are active!</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search jobs, clients..."
            className="px-3 py-2 text-sm border border-neutral-200 rounded-md w-64"
          />
          <span className="text-sm text-neutral-500">
            {filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="flex items-center gap-1 px-3 py-2 text-sm border border-neutral-200 rounded-md hover:bg-neutral-50"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={handleExport}
            className="px-3 py-2 text-sm bg-brand-purple text-white rounded-md hover:bg-purple-700"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Warning banner */}
      <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
        <span>
          These jobs are marked "in progress" but haven't had a lesson in 45+ days.
          Consider following up with clients or closing these jobs.
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b border-neutral-200">
              <SortHeader field="job_name">Job Name</SortHeader>
              <SortHeader field="client_name">Client</SortHeader>
              <SortHeader field="last_lesson_date">Last Lesson</SortHeader>
              <SortHeader field="days_since_last_lesson">Days Since</SortHeader>
              <SortHeader field="total_lessons">Total Lessons</SortHeader>
              <SortHeader field="channel">Channel</SortHeader>
              <th className="py-2 pr-4 text-xs font-medium text-neutral-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayedJobs.map((job, idx) => (
              <tr
                key={job.service_id || idx}
                className={classNames(
                  'border-t border-neutral-100 hover:bg-neutral-50',
                  job.days_since_last_lesson > 90 && 'bg-red-50/50'
                )}
              >
                <td className="py-3 pr-4">
                  <a
                    href={`https://account.acmeops.com/cal/service/${job.service_id}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-purple hover:underline font-medium"
                  >
                    {job.job_name || 'Unnamed Job'}
                  </a>
                </td>
                <td className="py-3 pr-4 text-neutral-700">
                  {job.client_name || '-'}
                </td>
                <td className="py-3 pr-4 text-neutral-600">
                  {job.last_lesson_date
                    ? DateTime.fromISO(job.last_lesson_date).toFormat('MMM d, yyyy')
                    : <span className="text-red-600 font-medium">Never</span>
                  }
                </td>
                <td className="py-3 pr-4">
                  <span className={classNames(
                    'px-2 py-1 rounded text-xs font-medium',
                    getSeverityColor(job.days_since_last_lesson)
                  )}>
                    {job.days_since_last_lesson != null
                      ? `${job.days_since_last_lesson} days`
                      : 'N/A'
                    }
                  </span>
                </td>
                <td className="py-3 pr-4 text-neutral-700">
                  {job.total_lessons || 0}
                </td>
                <td className="py-3 pr-4">
                  <span className="px-2 py-1 rounded text-xs bg-neutral-100 text-neutral-700 capitalize">
                    {job.channel || 'unknown'}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <a
                    href={`https://account.acmeops.com/cal/service/${job.service_id}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-brand-purple hover:text-purple-700"
                    title="Open in TutorCruncher"
                  >
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                    <span className="text-xs">View TC</span>
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Show more/less */}
      {filteredJobs.length > 10 && (
        <div className="flex justify-center">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-sm text-brand-purple hover:text-purple-700"
          >
            {showAll
              ? 'Show less'
              : `Show all ${filteredJobs.length} stale jobs`
            }
          </button>
        </div>
      )}
    </div>
  );
}
