import React, { useState, useEffect, useMemo } from 'react';
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

// Import DataModal from AnalyticsDashboard
function DataModal({ open, onClose, title, rows }) {
  // Check if this is active tutors data
  const isActiveTutorsData = title.includes('Active Tutors');
  // Check if this is hours data
  const isHoursData = title.includes('Total Hours') && rows.length > 0 && rows[0] && ('total_hours' in rows[0] || 'totalHours' in rows[0]);
  // Check if this is students data (old format - just student name and count)
  const isStudentsData = title.includes('Total Students') && rows.length > 0 && rows[0] && (('student_name' in rows[0] || 'studentName' in rows[0]) && ('lesson_count' in rows[0] || 'lessonCount' in rows[0]) && !('lessonId' in rows[0]));
  // Check if this is students detail data (new format - lesson-level with student info)
  const isStudentsDetailData = title.includes('Total Students') && rows.length > 0 && rows[0] && ('studentName' in rows[0] || 'student_name' in rows[0]) && ('lessonId' in rows[0] || 'lesson_id' in rows[0]);
  // Check if this is profit data
  const isProfitData = title.includes('Total Profit') && rows.length > 0 && rows[0] && ('profit' in rows[0] || 'profitMarginPct' in rows[0]);
  const [query, setQuery] = React.useState("");
  const normalizedQuery = query.trim().toLowerCase();
  
  // Ensure rows is always an array
  const safeRows = Array.isArray(rows) ? rows : [];
  
  // Detect if this is adhoc pay data
  const isAdhocPayData = safeRows.length > 0 && safeRows[0] && 'charge_id' in safeRows[0];
  
  const filteredRows = React.useMemo(() => {
    if (!normalizedQuery) return safeRows;
    return safeRows.filter((r) => {
      if (!r || typeof r !== 'object') return false;
      
      if (isActiveTutorsData) {
        // Filter for active tutors data
        const hay = [
          String(r.tutor_name || r.tutorName || ""),
          String(r.completed_lessons || r.completedLessons || 0),
        ]
          .join("|")
          .toLowerCase();
        return hay.includes(normalizedQuery);
      } else if (isHoursData) {
        // Filter for hours data
        const hay = [
          String(r.tutor_name || r.tutorName || ""),
          String(r.total_hours || r.totalHours || 0),
        ]
          .join("|")
          .toLowerCase();
        return hay.includes(normalizedQuery);
      } else if (isStudentsData) {
        // Filter for students data
        const hay = [
          String(r.student_name || r.studentName || ""),
          String(r.lesson_count || r.lessonCount || 0),
        ]
          .join("|")
          .toLowerCase();
        return hay.includes(normalizedQuery);
      } else if (isAdhocPayData) {
        // Filter for adhoc pay data
        const hay = [
          String(r.charge_id || ""),
          String(r.description || ""),
          String(r.category_name || ""),
          String(r.contractor_name || ""),
          String(r.creator_name || ""),
          String(r.date_occurred || ""),
          String(r.pay_contractor ?? 0),
        ]
          .join("|")
          .toLowerCase();
        return hay.includes(normalizedQuery);
      } else {
        // Filter for regular lesson data, students detail data, or profit data
        const hay = [
          String(r.lessonId || ""),
          String(r.jobName || ""),
          String(r.date || ""),
          String(r.hours || ""),
          String(r.revenue ?? 0),
          String(r.tutorName || ""),
          String(r.tutorPay ?? 0),
          String(r.adhocPay ?? 0),
          String(r.profit ?? 0),
          String(r.profitMarginPct ?? 0),
          String(r.studentName || r.student_name || ""),
          String(r.studentNames || ""),
          String(r.clientName || r.client_name || ""),
          String(r.studentRevenue ?? 0),
          String(r.service_labels ? (Array.isArray(r.service_labels) ? r.service_labels.map(l => typeof l === 'object' ? l.name || l : l).join(' ') : r.service_labels) : ""),
          String(r.location || ""),
        ]
          .join("|")
          .toLowerCase();
        return hay.includes(normalizedQuery);
      }
    });
  }, [safeRows, normalizedQuery, isAdhocPayData, isStudentsData, isStudentsDetailData, isProfitData, isActiveTutorsData, isHoursData]);

  const handleCSVDownload = () => {
    if (filteredRows.length === 0) return;
    
    let headers, csvContent;
    
    if (isAdhocPayData) {
      headers = ['Charge ID', 'Description', 'Category', 'Tutor', 'Creator', 'Date Occurred', 'Amount Paid'];
      csvContent = [
        headers.join(','),
        ...filteredRows.map(row => [
          row.charge_id || '',
          `"${(row.description || '').replace(/"/g, '""')}"`,
          `"${(row.category_name || '').replace(/"/g, '""')}"`,
          `"${(row.contractor_name || '').replace(/"/g, '""')}"`,
          `"${(row.creator_name || '').replace(/"/g, '""')}"`,
          row.date_occurred || '',
          row.pay_contractor || 0
        ].join(','))
      ].join('\n');
    } else if (isActiveTutorsData) {
      headers = ['Tutor Name', 'Completed Lessons'];
      csvContent = [
        headers.join(','),
        ...filteredRows.map(row => [
          `"${(row.tutor_name || row.tutorName || '').replace(/"/g, '""')}"`,
          row.completed_lessons || row.completedLessons || 0
        ].join(','))
      ].join('\n');
    } else if (isHoursData) {
      headers = ['Tutor Name', 'Total Hours'];
      csvContent = [
        headers.join(','),
        ...filteredRows.map(row => [
          `"${(row.tutor_name || row.tutorName || '').replace(/"/g, '""')}"`,
          row.total_hours || row.totalHours || 0
        ].join(','))
      ].join('\n');
    } else if (isStudentsData) {
      headers = ['Student Name', 'Lesson Count'];
      csvContent = [
        headers.join(','),
        ...filteredRows.map(row => [
          `"${(row.student_name || row.studentName || '').replace(/"/g, '""')}"`,
          row.lesson_count || row.lessonCount || 0
        ].join(','))
      ].join('\n');
    } else {
      headers = ['Lesson ID', 'Job Name', 'Date', 'Hours', 'Revenue', 'Tutor Name', 'Tutor Pay', 'Service Labels', 'Location'];
      csvContent = [
        headers.join(','),
        ...filteredRows.map(row => [
          row.lessonId || '',
          `"${(row.jobName || '').replace(/"/g, '""')}"`,
          row.date || '',
          row.hours || '',
          row.revenue || 0,
          `"${(row.tutorName || '').replace(/"/g, '""')}"`,
          row.tutorPay || 0,
          `"${(row.service_labels ? (Array.isArray(row.service_labels) ? row.service_labels.map(l => typeof l === 'object' ? l.name || l : l).join(' ') : row.service_labels) : '').replace(/"/g, '""')}"`,
          `"${(row.location || '').replace(/"/g, '""')}"`
        ].join(','))
      ].join('\n');
    }
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-neutral-500 opacity-75" onClick={onClose}></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-[95vw] lg:max-w-[98vw] xl:max-w-[95vw] sm:w-full">
          <div className="flex items-center justify-between px-3 sm:px-6 py-3 border-b border-neutral-100 flex-shrink-0">
            <h3 className="text-lg font-semibold text-brand-navy truncate">{title}</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCSVDownload}
                className="inline-flex items-center px-3 py-1.5 border border-neutral-300 shadow-sm text-sm leading-4 font-medium rounded-md text-neutral-700 bg-white hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-purple"
              >
                Download CSV
              </button>
              <button
                onClick={onClose}
                className="rounded-md text-neutral-400 hover:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-purple"
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="px-3 sm:px-6 py-4 max-h-[calc(100vh-200px)] overflow-y-auto">
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="block w-full px-3 py-2 border border-neutral-300 rounded-md shadow-sm placeholder-neutral-400 focus:outline-none focus:ring-brand-purple focus:border-brand-purple sm:text-sm"
              />
            </div>

            <div className="overflow-x-auto -mx-3 sm:-mx-6 px-3 sm:px-6">
              <div className="inline-block min-w-full align-middle">
                <div className="overflow-visible shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                  <table className="min-w-full divide-y divide-neutral-300" style={{ minWidth: '1400px' }}>
                    <thead className="bg-neutral-50">
                      <tr>
                        {isAdhocPayData ? (
                          <>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Charge ID</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Description</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Category</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Tutor</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Creator</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Date Occurred</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Amount Paid</th>
                          </>
                        ) : isActiveTutorsData ? (
                          <>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Tutor Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Completed Lessons</th>
                          </>
                        ) : isHoursData ? (
                          <>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Tutor Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Total Hours</th>
                          </>
                        ) : isStudentsData ? (
                          <>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Student Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Lesson Count</th>
                          </>
                        ) : isStudentsDetailData ? (
                          <>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '100px' }}>Lesson ID</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '300px' }}>Job Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '100px' }}>Date</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '100px' }}>Finish</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '70px' }}>Hours</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '90px' }}>Revenue</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '120px' }}>Tutor Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '90px' }}>Tutor Pay</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '150px' }}>Student Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '150px' }}>Client Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '90px' }}>Student Revenue</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '110px' }}>Charge Type</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '120px' }}>Status</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '150px' }}>Service Labels</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '100px' }}>Location</th>
                          </>
                        ) : isProfitData ? (
                          <>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '100px' }}>Lesson ID</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '300px' }}>Job Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '100px' }}>Date</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '100px' }}>Finish</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '70px' }}>Hours</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '90px' }}>Revenue</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '120px' }}>Tutor Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '90px' }}>Tutor Pay</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '90px' }}>Adhoc Pay</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '90px' }}>Profit</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '100px' }}>Profit Margin</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '200px' }}>Students</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '110px' }}>Charge Type</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '120px' }}>Status</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '150px' }}>Service Labels</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '100px' }}>Location</th>
                          </>
                        ) : (
                          <>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '100px' }}>Lesson ID</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '300px' }}>Job Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '100px' }}>Date</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '100px' }}>Finish</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '70px' }}>Hours</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '90px' }}>Revenue</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '120px' }}>Tutor Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '90px' }}>Tutor Pay</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '200px' }}>Students</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '110px' }}>Charge Type</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '120px' }}>Status</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '150px' }}>Service Labels</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '100px' }}>Location</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-neutral-200">
                      {filteredRows.map((r, idx) => {
                        if (isAdhocPayData) {
                          return (
                            <tr key={idx} className="border-t border-neutral-100">
                              <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm font-medium">
                                {r.charge_id || '—'}
                              </td>
                              <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm">
                                {r.description || '—'}
                              </td>
                              <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm">
                                {r.category_name || '—'}
                              </td>
                              <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm">
                                {r.contractor_name || '—'}
                              </td>
                              <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm">
                                {r.creator_name || '—'}
                              </td>
                              <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm">
                                {r.date_occurred || '—'}
                              </td>
                              <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm">
                                ${Number(r.pay_contractor || 0).toFixed(2)}
                              </td>
                            </tr>
                          );
                        }
                        
                        if (isActiveTutorsData) {
                          return (
                            <tr key={idx} className="border-t border-neutral-100">
                              <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm font-medium">
                                {r.tutor_name || r.tutorName || 'Unknown Tutor'}
                              </td>
                              <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm">
                                {r.completed_lessons || r.completedLessons || 0}
                              </td>
                            </tr>
                          );
                        }
                        
                        if (isHoursData) {
                          return (
                            <tr key={idx} className="border-t border-neutral-100">
                              <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm font-medium">
                                {r.tutor_name || r.tutorName || 'Unknown Tutor'}
                              </td>
                              <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm">
                                {Number(r.total_hours || r.totalHours || 0).toFixed(2)}
                              </td>
                            </tr>
                          );
                        }
                        
                        if (isStudentsData) {
                          return (
                            <tr key={idx} className="border-t border-neutral-100">
                              <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm font-medium">
                                {r.student_name || r.studentName || 'Unknown Student'}
                              </td>
                              <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm">
                                {r.lesson_count || r.lessonCount || 0}
                              </td>
                            </tr>
                          );
                        }
                        
                        if (isStudentsDetailData) {
                          return (
                            <tr key={idx} className="border-t border-neutral-100 hover:bg-neutral-50">
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm font-medium whitespace-nowrap">
                                {r.lessonId || '—'}
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm" style={{ maxWidth: '300px' }}>
                                <div className="break-words" title={r.jobName || ''}>
                                  {r.jobName || '—'}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap">
                                {r.date || '—'}
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap">
                                {r.finishDate || '—'}
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap text-right">
                                {r.hours || '—'}
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap text-right">
                                {r.revenue ? `$${Number(r.revenue).toFixed(2)}` : '—'}
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap">
                                {r.tutorName || '—'}
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap text-right">
                                {r.tutorPay ? `$${Number(r.tutorPay).toFixed(2)}` : '—'}
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm font-medium" style={{ maxWidth: '150px' }}>
                                <div className="break-words" title={r.studentName || r.student_name || ''}>
                                  {r.studentName || r.student_name || '—'}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm" style={{ maxWidth: '150px' }}>
                                <div className="break-words" title={r.clientName || r.client_name || ''}>
                                  {r.clientName || r.client_name || '—'}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap text-right">
                                {r.studentRevenue ? `$${Number(r.studentRevenue).toFixed(2)}` : '—'}
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap">
                                {r.chargeType ? (
                                  <span className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded whitespace-nowrap">
                                    {r.chargeType}
                                  </span>
                                ) : (
                                  <span className="text-neutral-400">—</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap">
                                {r.appointmentStatus ? (
                                  <span className={`inline-block px-2 py-1 text-xs rounded whitespace-nowrap ${
                                    r.appointmentStatus === 'complete' || r.appointmentStatus === 'completed' 
                                      ? 'bg-green-100 text-green-700' 
                                      : r.appointmentStatus === 'cancelled-chargeable'
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : 'bg-neutral-100 text-neutral-700'
                                  }`}>
                                    {r.appointmentStatus}
                                  </span>
                                ) : (
                                  <span className="text-neutral-400">—</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm" style={{ maxWidth: '150px' }}>
                                {(() => {
                                  if (!r.service_labels) {
                                    return <span className="text-neutral-400">—</span>;
                                  }
                                  
                                  let labels = r.service_labels;
                                  if (typeof labels === 'string') {
                                    try {
                                      labels = JSON.parse(labels);
                                    } catch (e) {
                                      if (labels.toLowerCase().includes('first lesson complete')) {
                                        return <span className="text-neutral-400">—</span>;
                                      }
                                      return (
                                        <span className="inline-block px-2 py-1 text-xs bg-neutral-100 text-neutral-700 rounded">
                                          {labels}
                                        </span>
                                      );
                                    }
                                  }
                                  
                                  if (Array.isArray(labels) && labels.length > 0) {
                                    const hasOtherLabels = labels.some(label => {
                                      const labelText = typeof label === 'object' ? (label.name || label) : label;
                                      return labelText && !labelText.toLowerCase().includes('first lesson complete');
                                    });
                                    
                                    let labelsToShow = labels;
                                    if (hasOtherLabels) {
                                      labelsToShow = labels.filter(label => {
                                        const labelText = typeof label === 'object' ? (label.name || label) : label;
                                        return labelText && !labelText.toLowerCase().includes('first lesson complete');
                                      });
                                    }
                                    
                                    if (labelsToShow.length === 0) {
                                      return <span className="text-neutral-400">—</span>;
                                    }
                                    
                                    return (
                                      <div className="flex flex-wrap gap-1">
                                        {labelsToShow.map((label, idx) => {
                                          const labelText = typeof label === 'object' ? (label.name || label) : label;
                                          return (
                                            <span key={idx} className="inline-block px-2 py-1 text-xs bg-neutral-100 text-neutral-700 rounded">
                                              {labelText}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    );
                                  }
                                  
                                  return <span className="text-neutral-400">—</span>;
                                })()}
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap">
                                {r.location || '—'}
                              </td>
                            </tr>
                          );
                        }
                        
                        if (isProfitData) {
                          return (
                            <tr key={idx} className="border-t border-neutral-100 hover:bg-neutral-50">
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm font-medium whitespace-nowrap">
                                {r.lessonId || '—'}
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm" style={{ maxWidth: '300px' }}>
                                <div className="break-words" title={r.jobName || ''}>
                                  {r.jobName || '—'}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap">
                                {r.date || '—'}
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap">
                                {r.finishDate || '—'}
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap text-right">
                                {r.hours || '—'}
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap text-right font-medium">
                                {r.revenue ? `$${Number(r.revenue).toFixed(2)}` : '—'}
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap">
                                {r.tutorName || '—'}
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap text-right">
                                {r.tutorPay ? `$${Number(r.tutorPay).toFixed(2)}` : '—'}
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap text-right">
                                {r.adhocPay ? `$${Number(r.adhocPay).toFixed(2)}` : '—'}
                              </td>
                              <td className={`py-2 px-3 text-xs sm:text-sm whitespace-nowrap text-right font-bold ${
                                Number(r.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {r.profit ? `$${Number(r.profit).toFixed(2)}` : '—'}
                              </td>
                              <td className={`py-2 px-3 text-xs sm:text-sm whitespace-nowrap text-right font-medium ${
                                Number(r.profitMarginPct || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {r.profitMarginPct ? `${Number(r.profitMarginPct).toFixed(1)}%` : '—'}
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm" style={{ maxWidth: '200px' }}>
                                {r.studentNames ? (
                                  <div>
                                    <div className="break-words" title={r.studentNames}>
                                      {r.studentNames}
                                    </div>
                                    {r.studentCount > 0 && (
                                      <div className="text-xs text-neutral-500 mt-0.5">
                                        ({r.studentCount} {r.studentCount === 1 ? 'student' : 'students'})
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-neutral-400">—</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap">
                                {r.chargeType ? (
                                  <span className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded whitespace-nowrap">
                                    {r.chargeType}
                                  </span>
                                ) : (
                                  <span className="text-neutral-400">—</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap">
                                {r.appointmentStatus ? (
                                  <span className={`inline-block px-2 py-1 text-xs rounded whitespace-nowrap ${
                                    r.appointmentStatus === 'complete' || r.appointmentStatus === 'completed' 
                                      ? 'bg-green-100 text-green-700' 
                                      : r.appointmentStatus === 'cancelled-chargeable'
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : 'bg-neutral-100 text-neutral-700'
                                  }`}>
                                    {r.appointmentStatus}
                                  </span>
                                ) : (
                                  <span className="text-neutral-400">—</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm" style={{ maxWidth: '150px' }}>
                                {(() => {
                                  if (!r.service_labels) {
                                    return <span className="text-neutral-400">—</span>;
                                  }
                                  
                                  let labels = r.service_labels;
                                  if (typeof labels === 'string') {
                                    try {
                                      labels = JSON.parse(labels);
                                    } catch (e) {
                                      if (labels.toLowerCase().includes('first lesson complete')) {
                                        return <span className="text-neutral-400">—</span>;
                                      }
                                      return (
                                        <span className="inline-block px-2 py-1 text-xs bg-neutral-100 text-neutral-700 rounded">
                                          {labels}
                                        </span>
                                      );
                                    }
                                  }
                                  
                                  if (Array.isArray(labels) && labels.length > 0) {
                                    const hasOtherLabels = labels.some(label => {
                                      const labelText = typeof label === 'object' ? (label.name || label) : label;
                                      return labelText && !labelText.toLowerCase().includes('first lesson complete');
                                    });
                                    
                                    let labelsToShow = labels;
                                    if (hasOtherLabels) {
                                      labelsToShow = labels.filter(label => {
                                        const labelText = typeof label === 'object' ? (label.name || label) : label;
                                        return labelText && !labelText.toLowerCase().includes('first lesson complete');
                                      });
                                    }
                                    
                                    if (labelsToShow.length === 0) {
                                      return <span className="text-neutral-400">—</span>;
                                    }
                                    
                                    return (
                                      <div className="flex flex-wrap gap-1">
                                        {labelsToShow.map((label, idx) => {
                                          const labelText = typeof label === 'object' ? (label.name || label) : label;
                                          return (
                                            <span key={idx} className="inline-block px-2 py-1 text-xs bg-neutral-100 text-neutral-700 rounded">
                                              {labelText}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    );
                                  }
                                  
                                  return <span className="text-neutral-400">—</span>;
                                })()}
                              </td>
                              <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap">
                                {r.location || '—'}
                              </td>
                            </tr>
                          );
                        }
                        
                        // Regular lesson data
                        return (
                          <tr key={idx} className="border-t border-neutral-100 hover:bg-neutral-50">
                            <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm font-medium whitespace-nowrap">
                              {r.lessonId || '—'}
                            </td>
                            <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm" style={{ maxWidth: '300px' }}>
                              <div className="break-words" title={r.jobName || ''}>
                                {r.jobName || '—'}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap">
                              {r.date || '—'}
                            </td>
                            <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap">
                              {r.finishDate || '—'}
                            </td>
                            <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap text-right">
                              {r.hours || '—'}
                            </td>
                            <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap text-right">
                              {r.revenue ? `$${Number(r.revenue).toFixed(2)}` : '—'}
                            </td>
                            <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap">
                              {r.tutorName || '—'}
                            </td>
                            <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap text-right">
                              {r.tutorPay ? `$${Number(r.tutorPay).toFixed(2)}` : '—'}
                            </td>
                            <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm" style={{ maxWidth: '200px' }}>
                              {r.studentNames ? (
                                <div>
                                  <div className="break-words" title={r.studentNames}>
                                    {r.studentNames}
                                  </div>
                                  {r.studentCount > 0 && (
                                    <div className="text-xs text-neutral-500 mt-0.5">
                                      ({r.studentCount} {r.studentCount === 1 ? 'student' : 'students'})
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-neutral-400">—</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap">
                              {r.chargeType ? (
                                <span className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded whitespace-nowrap">
                                  {r.chargeType}
                                </span>
                              ) : (
                                <span className="text-neutral-400">—</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap">
                              {r.appointmentStatus ? (
                                <span className={`inline-block px-2 py-1 text-xs rounded whitespace-nowrap ${
                                  r.appointmentStatus === 'complete' || r.appointmentStatus === 'completed' 
                                    ? 'bg-green-100 text-green-700' 
                                    : r.appointmentStatus === 'cancelled-chargeable'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-neutral-100 text-neutral-700'
                                }`}>
                                  {r.appointmentStatus}
                                </span>
                              ) : (
                                <span className="text-neutral-400">—</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm" style={{ maxWidth: '150px' }}>
                              {(() => {
                                if (!r.service_labels) {
                                  return <span className="text-neutral-400">—</span>;
                                }
                                
                                // Handle both string and array formats
                                let labels = r.service_labels;
                                if (typeof labels === 'string') {
                                  try {
                                    labels = JSON.parse(labels);
                                  } catch (e) {
                                    // If it's not valid JSON, treat as a single label
                                    if (labels.toLowerCase().includes('first lesson complete')) {
                                      return <span className="text-neutral-400">—</span>;
                                    }
                                    return (
                                      <span className="inline-block px-2 py-1 text-xs bg-neutral-100 text-neutral-700 rounded">
                                        {labels}
                                      </span>
                                    );
                                  }
                                }
                                
                                if (Array.isArray(labels) && labels.length > 0) {
                                  // Filter out "First Lesson Complete" only if there are other labels
                                  const hasOtherLabels = labels.some(label => {
                                    const labelText = typeof label === 'object' ? (label.name || label) : label;
                                    return labelText && !labelText.toLowerCase().includes('first lesson complete');
                                  });
                                  
                                  let labelsToShow = labels;
                                  if (hasOtherLabels) {
                                    // If there are other labels, filter out "First Lesson Complete"
                                    labelsToShow = labels.filter(label => {
                                      const labelText = typeof label === 'object' ? (label.name || label) : label;
                                      return labelText && !labelText.toLowerCase().includes('first lesson complete');
                                    });
                                  }
                                  
                                  if (labelsToShow.length === 0) {
                                    return <span className="text-neutral-400">—</span>;
                                  }
                                  
                                  return (
                                    <div className="flex flex-wrap gap-1">
                                      {labelsToShow.map((label, idx) => {
                                        const labelText = typeof label === 'object' ? (label.name || label) : label;
                                        return (
                                          <span key={idx} className="inline-block px-2 py-1 text-xs bg-neutral-100 text-neutral-700 rounded">
                                            {labelText}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  );
                                }
                                
                                return <span className="text-neutral-400">—</span>;
                              })()}
                            </td>
                            <td className="py-2 px-3 text-neutral-800 text-xs sm:text-sm whitespace-nowrap">
                              {r.location || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {filteredRows.length === 0 && (
              <div className="text-center py-8 text-neutral-500">
                {query ? 'No results found for your search.' : 'No data available.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const FRANCHISEE_LOCATIONS = [
  { id: 'all', name: 'All Locations', db: 'all' },
  { id: 'westside', name: 'Westside', db: 'westside' },
  { id: 'eastside', name: 'Eastside', db: 'eastside' }
];

const TIME_VIEWS = ["Weekly", "Monthly", "Yearly"];

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

function Section({ title, children, actions }) {
  return (
    <section className="bg-white border border-neutral-200 rounded-xl shadow-sm">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-neutral-100">
        <h3 className="text-base sm:text-lg font-semibold text-brand-navy font-heading">{title}</h3>
        {actions}
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  );
}

function Toolbar({
  view,
  onViewChange,
  onPrev,
  onNext,
  canNext,
  rangeText,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  onClearCustom,
  displayStart,
  displayEnd,
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="inline-flex rounded-md border border-neutral-200 overflow-hidden">
        {TIME_VIEWS.map((v) => (
          <button
            key={v}
            onClick={() => onViewChange(v)}
            className={classNames(
              "px-3 py-1.5 text-sm",
              v === view ? "bg-brand-purple text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"
            )}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2">
          <button onClick={onPrev} className="px-2 py-1 rounded border border-neutral-200 bg-white text-sm hover:bg-neutral-50">◀</button>
          <div className="border border-neutral-200 rounded-md bg-white px-1.5 py-1.5 inline-block">
            <DatePicker
              selected={customStart || displayStart}
              onChange={(d) => onCustomStartChange(d)}
              selectsStart
              startDate={customStart || displayStart}
              endDate={customEnd || displayEnd}
              placeholderText="Start date"
              className="text-sm border-none p-0 focus:outline-none w-28 text-center"
            />
          </div>
          <span className="text-neutral-600">-</span>
          <div className="border border-neutral-200 rounded-md bg-white px-1.5 py-1.5 inline-block">
            <DatePicker
              selected={customEnd || displayEnd}
              onChange={(d) => onCustomEndChange(d)}
              selectsEnd
              startDate={customStart || displayStart}
              endDate={customEnd || displayEnd}
              minDate={customStart || displayStart || undefined}
              placeholderText="End date"
              className="text-sm border-none p-0 focus:outline-none w-28 text-center"
            />
          </div>
          <button onClick={onNext} disabled={!canNext} className={classNames("px-2 py-1 rounded border text-sm", canNext ? "border-neutral-200 bg-white hover:bg-neutral-50" : "border-neutral-100 bg-neutral-50 text-neutral-400 cursor-not-allowed")}>▶</button>
        </div>
        {(customStart || customEnd) && (
          <button onClick={onClearCustom} className="px-2 py-1 text-xs border border-neutral-200 rounded-md bg-white hover:bg-neutral-50">Clear</button>
        )}
      </div>
    </div>
  );
}

function KPICard({ label, value, delta, onClick, subtitle, locationBreakdown }) {
  const positive = typeof delta === "number" && delta >= 0;
  const deltaText = typeof delta === "number" ? `${positive ? "+" : ""}${delta.toFixed(1)}%` : undefined;
  
  // Format location breakdown
  const formatBreakdown = (breakdown) => {
    if (!breakdown) return null;
    const parts = [];
    if (breakdown.westside !== undefined && breakdown.westside !== null) {
      let nashValue;
      if (typeof breakdown.westside === 'number') {
        // Check if this is a currency value (from context of label or value)
        const isCurrency = label && (label.toLowerCase().includes('revenue') || label.toLowerCase().includes('pay') || label.toLowerCase().includes('profit'));
        if (isCurrency) {
          nashValue = `$${breakdown.westside.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        } else {
          nashValue = breakdown.westside.toLocaleString('en-US', {minimumFractionDigits: breakdown.westside % 1 !== 0 ? 2 : 0, maximumFractionDigits: breakdown.westside % 1 !== 0 ? 2 : 0});
        }
      } else {
        nashValue = breakdown.westside;
      }
      parts.push(`Westside: ${nashValue}`);
    }
    if (breakdown.eastside !== undefined && breakdown.eastside !== null) {
      let orlValue;
      if (typeof breakdown.eastside === 'number') {
        // Check if this is a currency value
        const isCurrency = label && (label.toLowerCase().includes('revenue') || label.toLowerCase().includes('pay') || label.toLowerCase().includes('profit'));
        if (isCurrency) {
          orlValue = `$${breakdown.eastside.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        } else {
          orlValue = breakdown.eastside.toLocaleString('en-US', {minimumFractionDigits: breakdown.eastside % 1 !== 0 ? 2 : 0, maximumFractionDigits: breakdown.eastside % 1 !== 0 ? 2 : 0});
        }
      } else {
        orlValue = breakdown.eastside;
      }
      parts.push(`Eastside: ${orlValue}`);
    }
    return parts.length > 0 ? parts.join(' • ') : null;
  };
  
  const breakdownText = locationBreakdown ? formatBreakdown(locationBreakdown) : null;
  
  return (
    <button
      onClick={onClick}
      className="group w-full text-left bg-white border border-neutral-200 rounded-xl p-4 sm:p-5 shadow-sm hover:shadow transition-shadow focus:outline-none"
    >
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-2xl sm:text-3xl font-semibold text-brand-navy">{value}</div>
        {deltaText && (
          <span
            className={classNames(
              "text-xs px-1.5 py-0.5 rounded-md",
              positive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            )}
          >
            {deltaText}
          </span>
        )}
      </div>
      {subtitle && <div className="mt-1 text-xs text-neutral-500">{subtitle}</div>}
      {breakdownText && (
        <div className="mt-2 pt-2 border-t border-neutral-100">
          <div className="text-xs text-neutral-600 font-medium">{breakdownText}</div>
        </div>
      )}
    </button>
  );
}

// Placeholder for DataModal - will be added

export default function FranchiseeAnalytics() {
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [timeView, setTimeView] = useState("Monthly");
  const [page, setPage] = useState(0);
  const [customStart, setCustomStart] = useState(null);
  const [customEnd, setCustomEnd] = useState(null);
  const [loading, setLoading] = useState(false);
  const [serverData, setServerData] = useState(null);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [detailRows, setDetailRows] = useState([]);
  const now = new Date();

  // Helpers for date math (Sunday-Saturday weeks)
  const startOfWeekSunday = (d) => {
    const date = new Date(d);
    const day = date.getDay(); // 0=Sun
    const diff = day; // days since Sunday
    date.setDate(date.getDate() - diff);
    date.setHours(0, 0, 0, 0);
    return date;
  };
  const endOfWeekSaturday = (d) => {
    const start = startOfWeekSunday(d);
    const end = new Date(start);
    end.setDate(start.getDate() + 7); // Start of next week (exclusive end)
    end.setHours(0, 0, 0, 0);
    return end;
  };
  const startOfMonth = (d) => {
    const date = new Date(d.getFullYear(), d.getMonth(), 1);
    date.setHours(0, 0, 0, 0);
    return date;
  };
  const endOfMonth = (d) => {
    const date = new Date(d.getFullYear(), d.getMonth() + 1, 1); // Start of next month (exclusive end)
    date.setHours(0, 0, 0, 0);
    return date;
  };
  const startOfYear = (d) => {
    const date = new Date(d.getFullYear(), 0, 1);
    date.setHours(0, 0, 0, 0);
    return date;
  };
  const endOfYear = (d) => {
    const date = new Date(d.getFullYear() + 1, 0, 1); // Start of next year (exclusive end)
    date.setHours(0, 0, 0, 0);
    return date;
  };
  const addOffset = (d, unit, offset) => {
    const date = new Date(d);
    if (unit === 'week') {
      date.setDate(date.getDate() + offset * 7);
    } else if (unit === 'month') {
      // Pin to day 1 first to avoid overflow (e.g. Mar 31 - 1 month = Mar 3 instead of Feb 28)
      date.setDate(1);
      date.setMonth(date.getMonth() + offset);
    } else if (unit === 'year') {
      date.setFullYear(date.getFullYear() + offset);
    }
    return date;
  };

  const computeRange = () => {
    if (customStart && customEnd) {
      // Custom end date needs to be adjusted to exclusive end (start of next day)
      const exclusiveEnd = new Date(customEnd);
      exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
      exclusiveEnd.setHours(0, 0, 0, 0);
      return { start: customStart, end: exclusiveEnd };
    }
    const anchor = addOffset(now, timeView === 'Weekly' ? 'week' : timeView === 'Monthly' ? 'month' : 'year', page);
    if (timeView === 'Weekly') return { start: startOfWeekSunday(anchor), end: endOfWeekSaturday(anchor) };
    if (timeView === 'Yearly') return { start: startOfYear(anchor), end: endOfYear(anchor) };
    return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
  };

  const { start: rangeStartDate, end: rangeEndDate } = useMemo(() => computeRange(), [timeView, page, customStart, customEnd]);
  const canNext = rangeEndDate <= now || (customStart && customEnd && rangeEndDate <= now);

  // Fetch franchisee analytics data
  useEffect(() => {
    const controller = new AbortController();
    async function fetchFranchiseeAnalytics() {
      setLoading(true);
      setError(null);
      try {
        const params = {
          location: selectedLocation,
          view: timeView.toLowerCase(),
          start: rangeStartDate.toISOString(),
          end: rangeEndDate.toISOString(),
        };
        
        const qs = new URLSearchParams(params).toString();

        const resp = await fetch(`/api/franchisee-analytics?${qs}`, {
          signal: controller.signal,
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        
        if (!resp.ok) {
          if (resp.status === 403) {
            throw new Error('Access denied. Franchisee Analytics is only available to the main branch.');
          }
          throw new Error(`HTTP ${resp.status}`);
        }
        
        const json = await resp.json();
        setServerData(json);
      } catch (e) {
        if (e.name === 'AbortError') return;
        console.error('Failed to fetch franchisee analytics:', e);
        setError(e.message);
        setServerData(null);
    } finally {
      setLoading(false);
    }
    }
    fetchFranchiseeAnalytics();
    return () => controller.abort();
  }, [selectedLocation, timeView, page, customStart, customEnd, rangeStartDate, rangeEndDate]);

  const totals = serverData?.totals;
  const breakdown = serverData?.breakdown;
  // Display the inclusive end date (subtract 1 day from the exclusive end)
  const displayEndDate = new Date(rangeEndDate);
  displayEndDate.setDate(displayEndDate.getDate() - 1);
  const rangeText = `${rangeStartDate.toLocaleDateString()} – ${displayEndDate.toLocaleDateString()}`;
  const isFutureRange = rangeStartDate > now;
  
  // Helper to get location breakdown for a metric
  const getLocationBreakdown = (metricKey) => {
    if (selectedLocation !== 'all' || !breakdown) return null;
    return {
      'westside': breakdown.westside?.[metricKey],
      'eastside': breakdown.eastside?.[metricKey]
    };
  };

  // Open drilldown modal
  const openDrilldown = async (title, metric) => {
    setModalTitle(title);
    setModalOpen(true);
    setDetailRows([]); // Clear previous rows
    
    try {
      const params = {
        location: selectedLocation,
        metric: metric,
        start: rangeStartDate.toISOString(),
        end: rangeEndDate.toISOString(),
      };
      
      const qs = new URLSearchParams(params).toString();

      const resp = await fetch(`/api/franchisee-analytics/detail?${qs}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      
      const json = await resp.json();
      setDetailRows(json.rows || []);
    } catch (error) {
      console.error('Failed to fetch drilldown data:', error);
      setDetailRows([{ error: 'Failed to load drilldown data' }]);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="flex items-center gap-3 p-3 rounded-lg border text-sm bg-red-50 border-red-200 text-red-800"
        >
          <ExclamationTriangleIcon className="h-5 w-5" />
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-4">
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
          >
            {FRANCHISEE_LOCATIONS.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
        <Toolbar
          view={timeView}
          onViewChange={(g) => { setTimeView(g); setPage(0); }}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
          canNext={!isFutureRange}
          rangeText={rangeText}
          customStart={customStart}
          customEnd={customEnd}
          onCustomStartChange={(d) => { setCustomStart(d); setPage(0); }}
          onCustomEndChange={(d) => { setCustomEnd(d); setPage(0); }}
          onClearCustom={() => { setCustomStart(null); setCustomEnd(null); setPage(0); }}
          displayStart={rangeStartDate}
          displayEnd={displayEndDate}
        />
      </div>

      <Section title="Key Performance Indicators">
      {loading ? (
          <div className="text-sm text-neutral-500">Loading…</div>
        ) : totals ? (
          <div className="space-y-6">
            {/* Top Row - Number Metrics (Drivers) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className={isFutureRange ? "opacity-60 pointer-events-none" : ""}>
                <KPICard 
                  label="Total Lessons" 
                  value={Number(totals.totalLessons ?? 0).toLocaleString()} 
                  onClick={() => openDrilldown("Total Lessons - Raw Data", 'lessons')}
                  locationBreakdown={getLocationBreakdown('totalLessons')}
                />
              </div>
              <div className={isFutureRange ? "opacity-60 pointer-events-none" : ""}>
                <KPICard 
                  label="Total Hours" 
                  value={Number(totals.totalHours ?? 0).toLocaleString()} 
                  onClick={() => openDrilldown("Total Hours - Raw Data", 'hours')}
                  locationBreakdown={getLocationBreakdown('totalHours')}
                />
              </div>
              <div className={isFutureRange ? "opacity-60 pointer-events-none" : ""}>
                <KPICard 
                  label="Total Students" 
                  value={Number(totals.totalStudents ?? 0).toLocaleString()} 
                  onClick={() => openDrilldown("Total Students - Raw Data", 'students')}
                  locationBreakdown={getLocationBreakdown('totalStudents')}
                />
              </div>
              <div className={isFutureRange ? "opacity-60 pointer-events-none" : ""}>
                <KPICard 
                  label="Active Tutors" 
                  value={Number(totals.totalActiveTutors ?? 0).toLocaleString()} 
                  onClick={() => openDrilldown("Active Tutors - Raw Data", 'activetutors')}
                  locationBreakdown={getLocationBreakdown('totalActiveTutors')}
                />
              </div>
            </div>
            
            {/* Bottom Row - Dollar Metrics (Results) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className={isFutureRange ? "opacity-60 pointer-events-none" : ""}>
                <KPICard 
                  label="Total Revenue" 
                  value={`$${Number(totals.totalRevenue ?? 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} 
                  onClick={() => openDrilldown("Total Revenue - Raw Data", 'revenue')}
                  locationBreakdown={getLocationBreakdown('totalRevenue')}
                />
              </div>
              <div className={isFutureRange ? "opacity-60 pointer-events-none" : ""}>
                <KPICard 
                  label="Total Tutor Pay" 
                  value={`$${Number(totals.totalTutorPay ?? 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} 
                  subtitle={`Margin ${Number(totals.tutorPayMarginPct ?? 0).toFixed(1)}%`} 
                  onClick={() => openDrilldown("Total Tutor Pay - Raw Data", 'tutorpayexpected')}
                  locationBreakdown={getLocationBreakdown('totalTutorPay')}
                />
              </div>
              <div className={isFutureRange ? "opacity-60 pointer-events-none" : ""}>
                <KPICard 
                  label="Total Tutor Adhoc Pay" 
                  value={`$${Number(totals.totalAdhocPay ?? 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} 
                  onClick={() => openDrilldown("Total Tutor Adhoc Pay - Raw Data", 'tutoradhocpay')}
                  locationBreakdown={getLocationBreakdown('totalAdhocPay')}
                />
              </div>
              <div className={isFutureRange ? "opacity-60 pointer-events-none" : ""}>
                <KPICard 
                  label="Total Profit" 
                  value={`$${Number((totals.totalRevenue ?? 0) - (totals.totalTutorPay ?? 0) - (totals.totalAdhocPay ?? 0)).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} 
                  subtitle={`Margin ${Number(totals.profitMarginPct ?? 0).toFixed(1)}%`} 
                  onClick={() => openDrilldown("Total Profit - Raw Data", 'profit')}
                  locationBreakdown={(() => {
                    if (selectedLocation !== 'all' || !breakdown) return null;
                    const nashProfit = (breakdown.westside?.totalRevenue ?? 0) - (breakdown.westside?.totalTutorPay ?? 0) - (breakdown.westside?.totalAdhocPay ?? 0);
                    const orlProfit = (breakdown.eastside?.totalRevenue ?? 0) - (breakdown.eastside?.totalTutorPay ?? 0) - (breakdown.eastside?.totalAdhocPay ?? 0);
                    return {
                      'westside': nashProfit,
                      'eastside': orlProfit
                    };
                  })()}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            <span className="ml-2 text-sm text-neutral-600">Loading KPI data...</span>
          </div>
        )}
      </Section>

      {/* Location Breakdown */}
      {selectedLocation === 'all' && serverData?.breakdown && (
        <Section title="Location Breakdown">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h4 className="text-lg font-semibold text-neutral-800 mb-4">Westside</h4>
              <div className="grid grid-cols-2 gap-4">
                <KPICard label="Lessons" value={Number(serverData.breakdown.westside?.totalLessons ?? 0).toLocaleString()} />
                <KPICard label="Revenue" value={`$${Number(serverData.breakdown.westside?.totalRevenue ?? 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} />
                <KPICard label="Students" value={Number(serverData.breakdown.westside?.totalStudents ?? 0).toLocaleString()} />
                <KPICard label="Tutors" value={Number(serverData.breakdown.westside?.totalActiveTutors ?? 0).toLocaleString()} />
              </div>
            </div>
            <div>
              <h4 className="text-lg font-semibold text-neutral-800 mb-4">Eastside</h4>
              <div className="grid grid-cols-2 gap-4">
                <KPICard label="Lessons" value={Number(serverData.breakdown.eastside?.totalLessons ?? 0).toLocaleString()} />
                <KPICard label="Revenue" value={`$${Number(serverData.breakdown.eastside?.totalRevenue ?? 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} />
                <KPICard label="Students" value={Number(serverData.breakdown.eastside?.totalStudents ?? 0).toLocaleString()} />
                <KPICard label="Tutors" value={Number(serverData.breakdown.eastside?.totalActiveTutors ?? 0).toLocaleString()} />
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* DataModal for drilldown */}
      <DataModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        rows={detailRows}
      />
    </div>
  );
}
