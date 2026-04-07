import React, { useMemo, useState, useEffect, lazy, Suspense } from "react";
import { useCompanyName } from "../contexts/CompanyNameContext";
import { ExclamationTriangleIcon, XMarkIcon, Cog6ToothIcon, ChartBarIcon, ArrowTrendingUpIcon } from "@heroicons/react/24/outline";
import ClickableBarChart from "./charts/ClickableBarChart";
import TrendsChart from "./charts/TrendsChart";
import CreditAdjustmentsSummary from "./CreditAdjustmentsSummary";
import TutorDrilldownModal from "./TutorDrilldownModal";
import DateRangePicker from "./DateRangePicker";
import LabelConfigurationModal from "./LabelConfigurationModal";
import JobLabelSelectorModal from "./JobLabelSelectorModal";
import TutorLabelSelectorModal from "./TutorLabelSelectorModal";
import { DateTime } from "luxon";

// Lazy load ForecastDashboard to avoid circular dependencies and improve initial load
const ForecastDashboard = lazy(() => import("./Forecast/ForecastDashboard"));

// View-level tabs (Historical, Forecast)
const VIEW_TABS = [
  { id: "historical", label: "Historical", icon: ChartBarIcon, description: "Past performance data" },
  { id: "forecast", label: "Forecast", icon: ArrowTrendingUpIcon, description: "Future projections" },
];

const TABS = ["All", "Home", "Online", "Clubs", "Schools", "Community", "First Lesson Complete", "Job Labels", "Tutor Labels"];
const TIME_VIEWS = ["Weekly", "Monthly", "Yearly"]; // Keep simple, can add Daily later

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

// View-level tab switcher (Historical, Forecast)
function ViewTabSwitcher({ activeView, onChange }) {
  return (
    <div className="flex gap-1 p-1 bg-neutral-100 rounded-lg w-fit">
      {VIEW_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeView === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={classNames(
              "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200",
              "min-h-[44px] sm:min-h-0",
              isActive
                ? "bg-white text-brand-navy shadow-sm"
                : "text-neutral-600 hover:text-neutral-900 hover:bg-white/50"
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function TabSwitcher({ activeTab, onChange, onJobLabelsClick, onTutorLabelsClick }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((tab) => {
        // Special handling for Job Labels and Tutor Labels - they open modals instead of changing tab
        if (tab === "Job Labels") {
          return (
            <button
              key={tab}
              onClick={onJobLabelsClick}
              className={classNames(
                "px-3 py-2 sm:px-3 sm:py-1.5 rounded-md text-sm font-medium transition-colors touch-manipulation",
                "min-h-[44px] sm:min-h-0",
                "bg-white text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100 border border-neutral-200",
                "flex items-center gap-1.5"
              )}
            >
              <Cog6ToothIcon className="h-4 w-4" />
              {tab}
            </button>
          );
        }
        if (tab === "Tutor Labels") {
          return (
            <button
              key={tab}
              onClick={onTutorLabelsClick}
              className={classNames(
                "px-3 py-2 sm:px-3 sm:py-1.5 rounded-md text-sm font-medium transition-colors touch-manipulation",
                "min-h-[44px] sm:min-h-0",
                "bg-white text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100 border border-neutral-200",
                "flex items-center gap-1.5"
              )}
            >
              <Cog6ToothIcon className="h-4 w-4" />
              {tab}
            </button>
          );
        }
        // Regular tabs
        return (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className={classNames(
              "px-3 py-2 sm:px-3 sm:py-1.5 rounded-md text-sm font-medium transition-colors touch-manipulation",
              "min-h-[44px] sm:min-h-0",
              activeTab === tab
                ? "bg-brand-purple text-white shadow-sm"
                : "bg-white text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100 border border-neutral-200"
            )}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}


function KPICard({ label, value, delta, onClick, subtitle }) {
  const positive = typeof delta === "number" && delta >= 0;
  const deltaText = typeof delta === "number" ? `${positive ? "+" : ""}${delta.toFixed(1)}%` : undefined;
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
    </button>
  );
}

// Sort indicator icons for table headers
function SortIcon({ direction }) {
  if (!direction) {
    return (
      <svg className="w-3 h-3 ml-1 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
  }
  return direction === 'asc' ? (
    <svg className="w-3 h-3 ml-1 text-brand-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  ) : (
    <svg className="w-3 h-3 ml-1 text-brand-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// Filter dropdown icon
function FilterIcon({ isActive }) {
  return (
    <svg className={classNames("w-3 h-3", isActive ? "text-brand-purple" : "text-neutral-400")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
  );
}

function DataModal({ open, onClose, title, rows }) {
  // Check if this is active tutors data
  const isActiveTutorsData = title.includes('Active Tutors');
  // Check if this is hours data
  const isHoursData = title.includes('Total Hours') && rows.length > 0 && rows[0] && ('total_hours' in rows[0] || 'totalHours' in rows[0]);
  // Check if this is students data
  const isStudentsData = title.includes('Total Students') && rows.length > 0 && rows[0] && (('student_name' in rows[0] || 'studentName' in rows[0]) && ('lesson_count' in rows[0] || 'lessonCount' in rows[0]));
  // Check if this is revenue data (should not show Tutor/Tutor Pay columns)
  const isRevenueData = title.includes('Total Revenue');
  // Check if this is profit data (should only show profit, not revenue or tutor pay)
  const isProfitData = title.includes('Total Profit');
  const [query, setQuery] = React.useState("");

  // Sorting state
  const [sortColumn, setSortColumn] = React.useState(null);
  const [sortDirection, setSortDirection] = React.useState('asc'); // 'asc' or 'desc'

  // Column filter state
  const [columnFilters, setColumnFilters] = React.useState({});
  const [activeFilterColumn, setActiveFilterColumn] = React.useState(null);

  // Reset sort and filters when modal opens/closes or data changes
  React.useEffect(() => {
    if (open) {
      setSortColumn(null);
      setSortDirection('asc');
      setColumnFilters({});
      setActiveFilterColumn(null);
    }
  }, [open, title]);

  // Handle column header click for sorting
  const handleSort = (column) => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new column and default to ascending (for text) or descending (for numbers)
      setSortColumn(column);
      // Default to descending for numeric columns, ascending for text
      const numericColumns = ['charge_id', 'pay_contractor', 'lesson_count', 'lessonCount', 'total_hours', 'totalHours', 'completed_lessons', 'completedLessons', 'hours', 'revenue', 'tutorPay', 'profit', 'amount'];
      setSortDirection(numericColumns.includes(column) ? 'desc' : 'asc');
    }
  };

  // Handle column filter change
  const handleFilterChange = (column, value) => {
    setColumnFilters(prev => {
      if (!value || value === '') {
        const newFilters = { ...prev };
        delete newFilters[column];
        return newFilters;
      }
      return { ...prev, [column]: value };
    });
    setActiveFilterColumn(null);
  };

  // Clear all filters
  const clearAllFilters = () => {
    setColumnFilters({});
    setActiveFilterColumn(null);
  };

  // Close filter dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (activeFilterColumn && !e.target.closest('.filter-dropdown-container')) {
        setActiveFilterColumn(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeFilterColumn]);

  const normalizedQuery = query.trim().toLowerCase();

  // Ensure rows is always an array
  const safeRows = Array.isArray(rows) ? rows : [];

  // Detect if this is adhoc pay data
  const isAdhocPayData = safeRows.length > 0 && safeRows[0] && 'charge_id' in safeRows[0];

  // Get unique values for a column (for filter dropdown)
  const getUniqueValuesForColumn = React.useCallback((column) => {
    const values = new Set();
    safeRows.forEach(row => {
      if (!row) return;
      let value;
      switch (column) {
        case 'category':
          value = row.category_name || '';
          break;
        case 'tutor':
          value = row.contractor_name || row.tutor_name || row.tutorName || '';
          break;
        case 'creator':
          value = row.creator_name || '';
          break;
        case 'description':
          value = row.description || '';
          break;
        default:
          value = row[column] || '';
      }
      if (value) values.add(String(value));
    });
    return Array.from(values).sort((a, b) => String(a).localeCompare(String(b)));
  }, [safeRows]);

  // Get row value for a column (used in filtering and sorting)
  const getRowValue = React.useCallback((row, column) => {
    if (!row) return '';
    switch (column) {
      case 'charge_id':
        return row.charge_id || '';
      case 'description':
        return row.description || '';
      case 'category':
        return row.category_name || '';
      case 'tutor':
        return row.contractor_name || row.tutor_name || row.tutorName || '';
      case 'creator':
        return row.creator_name || '';
      case 'date':
        return row.date_occurred || row.date || '';
      case 'amount':
        return Number(row.pay_contractor ?? 0);
      case 'student_name':
        return row.student_name || row.studentName || '';
      case 'client_name':
        return row.client_name || row.clientName || '';
      case 'lesson_count':
        return Number(row.lesson_count || row.lessonCount || 0);
      case 'total_hours':
        return Number(row.total_hours || row.totalHours || 0);
      case 'completed_lessons':
        return Number(row.completed_lessons || row.completedLessons || 0);
      case 'hours':
        return Number(row.hours || 0);
      case 'revenue':
        return Number(row.revenue || 0);
      case 'tutorPay':
        return Number(row.tutorPay || 0);
      case 'profit':
        return Number(row.revenue || 0) - Number(row.tutorPay || 0);
      case 'jobName':
        return row.jobName || '';
      case 'lessonId':
        return row.lessonId || '';
      default:
        return row[column] || '';
    }
  }, []);

  const filteredRows = React.useMemo(() => {
    let result = safeRows;

    // Apply text search filter
    if (normalizedQuery) {
      result = result.filter((r) => {
        if (!r || typeof r !== 'object') return false;

        if (isActiveTutorsData) {
          const hay = [
            String(r.tutor_name || r.tutorName || ""),
            String(r.completed_lessons || r.completedLessons || 0),
          ].join("|").toLowerCase();
          return hay.includes(normalizedQuery);
        } else if (isHoursData) {
          const hay = [
            String(r.tutor_name || r.tutorName || ""),
            String(r.total_hours || r.totalHours || 0),
          ].join("|").toLowerCase();
          return hay.includes(normalizedQuery);
        } else if (isStudentsData) {
          const hay = [
            String(r.student_name || r.studentName || ""),
            String(r.client_name || r.clientName || ""),
            String(r.lesson_count || r.lessonCount || 0),
          ].join("|").toLowerCase();
          return hay.includes(normalizedQuery);
        } else if (isAdhocPayData) {
          const hay = [
            String(r.charge_id || ""),
            String(r.description || ""),
            String(r.category_name || ""),
            String(r.contractor_name || ""),
            String(r.creator_name || ""),
            String(r.date_occurred || ""),
            String(r.pay_contractor ?? 0),
          ].join("|").toLowerCase();
          return hay.includes(normalizedQuery);
        } else {
          const revenue = Number(r.revenue ?? 0);
          const tutorPay = Number(r.tutorPay ?? 0);
          const profit = revenue - tutorPay;
          const hay = [
            String(r.lessonId || ""),
            String(r.jobName || ""),
            String(r.date || ""),
            String(r.hours || ""),
            ...(isProfitData ? [String(profit)] : isRevenueData ? [String(revenue)] : [String(revenue), String(tutorPay), String(profit)]),
            ...(isRevenueData || isProfitData ? [] : [String(r.tutorName || ""), String(tutorPay)]),
            String(r.service_labels ? (Array.isArray(r.service_labels) ? r.service_labels.map(l => typeof l === 'object' ? l.name || l : l).join(' ') : r.service_labels) : ""),
          ].join("|").toLowerCase();
          return hay.includes(normalizedQuery);
        }
      });
    }

    // Apply column filters
    Object.entries(columnFilters).forEach(([column, filterValue]) => {
      if (filterValue) {
        result = result.filter(row => {
          const rowValue = String(getRowValue(row, column));
          return rowValue.toLowerCase().includes(filterValue.toLowerCase());
        });
      }
    });

    // Apply sorting
    if (sortColumn) {
      result = [...result].sort((a, b) => {
        const aVal = getRowValue(a, sortColumn);
        const bVal = getRowValue(b, sortColumn);

        // Numeric comparison
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }

        // String comparison
        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        if (sortDirection === 'asc') {
          return aStr.localeCompare(bStr);
        } else {
          return bStr.localeCompare(aStr);
        }
      });
    }

    return result;
  }, [safeRows, normalizedQuery, columnFilters, sortColumn, sortDirection, isActiveTutorsData, isHoursData, isStudentsData, isAdhocPayData, isProfitData, isRevenueData, getRowValue]);

  const handleCSVDownload = () => {
    if (filteredRows.length === 0) return;
    
    let headers, csvContent;
    
    if (isAdhocPayData) {
      headers = ['Charge ID', 'Description', 'Category', 'Tutor', 'Creator', 'Date Occurred', 'Amount Paid', 'Labels'];
      csvContent = [
        headers.join(','),
        ...filteredRows.map(row => {
          let labels = row.service_labels;
          if (typeof labels === 'string') {
            try {
              labels = JSON.parse(labels);
            } catch (e) {
              labels = [labels];
            }
          }
          const labelsStr = Array.isArray(labels) && labels.length > 0
            ? labels.map(l => typeof l === 'object' ? l.name || l : l).join(', ')
            : '';
          return [
            row.charge_id || '',
            `"${(row.description || '').replace(/"/g, '""')}"`,
            `"${(row.category_name || '').replace(/"/g, '""')}"`,
            `"${(row.contractor_name || '').replace(/"/g, '""')}"`,
            `"${(row.creator_name || '').replace(/"/g, '""')}"`,
            row.date_occurred || '',
            row.pay_contractor || 0,
            `"${labelsStr.replace(/"/g, '""')}"`
          ].join(',');
        })
      ].join('\n');
    } else if (isHoursData) {
      headers = ['Tutor Name', 'Total Hours'];
      csvContent = [
        headers.join(','),
        ...filteredRows.map(row => [
          `"${(row.tutor_name || row.tutorName || '').replace(/"/g, '""')}"`,
          Number(row.total_hours || row.totalHours || 0).toFixed(2)
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
    } else if (isStudentsData) {
      headers = ['Student Name', 'Client Name', 'Lesson Count'];
      csvContent = [
        headers.join(','),
        ...filteredRows.map(row => [
          `"${(row.student_name || row.studentName || '').replace(/"/g, '""')}"`,
          `"${(row.client_name || row.clientName || '').replace(/"/g, '""')}"`,
          row.lesson_count || row.lessonCount || 0
        ].join(','))
      ].join('\n');
    } else {
      // For revenue data, exclude Tutor and Tutor Pay columns
      if (isRevenueData) {
        headers = ['Lesson', 'Job Name', 'Date', 'Hours', 'Revenue', 'Labels'];
        csvContent = [
          headers.join(','),
          ...filteredRows.map(row => [
            row.lessonId || '',
            `"${(row.jobName || '').replace(/"/g, '""')}"`,
            row.date || '',
            Number(row.hours || 0).toFixed(2),
            Number(row.revenue || 0).toFixed(2),
            `"${(row.service_labels ? (Array.isArray(row.service_labels) ? row.service_labels.map(l => typeof l === 'object' ? l.name || l : l).join(', ') : row.service_labels) : '').replace(/"/g, '""')}"`
          ].join(','))
        ].join('\n');
      } else if (isProfitData) {
        // For profit data, only show profit (revenue - tutor pay)
        headers = ['Lesson', 'Job Name', 'Date', 'Hours', 'Profit', 'Labels'];
        csvContent = [
          headers.join(','),
          ...filteredRows.map(row => {
            const revenue = Number(row.revenue || 0);
            const tutorPay = Number(row.tutorPay || 0);
            const profit = revenue - tutorPay;
            return [
              row.lessonId || '',
              `"${(row.jobName || '').replace(/"/g, '""')}"`,
              row.date || '',
              Number(row.hours || 0).toFixed(2),
              profit.toFixed(2),
              `"${(row.service_labels ? (Array.isArray(row.service_labels) ? row.service_labels.map(l => typeof l === 'object' ? l.name || l : l).join(', ') : row.service_labels) : '').replace(/"/g, '""')}"`
            ].join(',');
          })
        ].join('\n');
      } else {
        headers = ['Lesson', 'Job Name', 'Date', 'Hours', 'Revenue', 'Tutor', 'Tutor Pay', 'Labels'];
        csvContent = [
          headers.join(','),
          ...filteredRows.map(row => [
            row.lessonId || '',
            `"${(row.jobName || '').replace(/"/g, '""')}"`,
            row.date || '',
            Number(row.hours || 0).toFixed(2),
            Number(row.revenue || 0).toFixed(2),
            `"${(row.tutorName || '').replace(/"/g, '""')}"`,
            Number(row.tutorPay || 0).toFixed(2),
            `"${(row.service_labels ? (Array.isArray(row.service_labels) ? row.service_labels.map(l => typeof l === 'object' ? l.name || l : l).join(', ') : row.service_labels) : '').replace(/"/g, '""')}"`
          ].join(','))
        ].join('\n');
      }
    }
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${title.replace(/[^a-zA-Z0-9]/g, '_')}_export.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-4">
        <div className="w-full max-w-5xl bg-white rounded-xl shadow-xl border border-neutral-200 overflow-hidden max-h-[95vh] flex flex-col">
          <div className="flex items-center justify-between px-3 sm:px-6 py-3 border-b border-neutral-100 flex-shrink-0">
            <h3 className="text-lg font-semibold text-brand-navy truncate">{title}</h3>
            <div className="flex items-center gap-2 ml-2">
              <button
                onClick={handleCSVDownload}
                disabled={filteredRows.length === 0}
                className="px-2 py-1.5 text-xs sm:text-sm bg-brand-purple text-white rounded-md hover:bg-purple-700 disabled:bg-neutral-300 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <span className="hidden sm:inline">Download CSV</span>
                <span className="sm:hidden">CSV</span>
              </button>
              <button 
                onClick={onClose} 
                className="text-neutral-500 hover:text-neutral-700 p-1 rounded-md hover:bg-neutral-100 flex-shrink-0"
                aria-label="Close modal"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="px-3 sm:px-6 py-2 border-b border-neutral-100 flex-shrink-0">
            <div className="flex items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isActiveTutorsData ? "Search tutor names or lesson counts..." : isHoursData ? "Search tutor names or hours..." : isStudentsData ? "Search student names or lesson counts..." : isAdhocPayData ? "Search charge ID, description, tutor, creator..." : isRevenueData ? "Search lessons, job name, date, labels…" : isProfitData ? "Search lessons, job name, date, profit, labels…" : "Search lessons, job name, date, tutor, labels…"}
                className="flex-1 px-3 py-2 text-sm border border-neutral-200 rounded-md"
              />
              {Object.keys(columnFilters).length > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="px-2 py-1.5 text-xs text-neutral-600 bg-neutral-100 rounded-md hover:bg-neutral-200 whitespace-nowrap"
                >
                  Clear Filters ({Object.keys(columnFilters).length})
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-auto p-3 sm:p-6">
            <div className="min-w-full overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-neutral-600">
                    {isActiveTutorsData ? (
                      <>
                        <th className="py-2 pr-2 sm:pr-4 text-xs sm:text-sm">
                          <button onClick={() => handleSort('tutor')} className="flex items-center hover:text-brand-purple transition-colors">
                            Tutor Name
                            <SortIcon direction={sortColumn === 'tutor' ? sortDirection : null} />
                          </button>
                        </th>
                        <th className="py-2 pr-2 sm:pr-4 text-xs sm:text-sm">
                          <button onClick={() => handleSort('completed_lessons')} className="flex items-center hover:text-brand-purple transition-colors">
                            Completed Lessons
                            <SortIcon direction={sortColumn === 'completed_lessons' ? sortDirection : null} />
                          </button>
                        </th>
                      </>
                    ) : isHoursData ? (
                      <>
                        <th className="py-2 pr-2 sm:pr-4 text-xs sm:text-sm">
                          <button onClick={() => handleSort('tutor')} className="flex items-center hover:text-brand-purple transition-colors">
                            Tutor Name
                            <SortIcon direction={sortColumn === 'tutor' ? sortDirection : null} />
                          </button>
                        </th>
                        <th className="py-2 pr-2 sm:pr-4 text-xs sm:text-sm">
                          <button onClick={() => handleSort('total_hours')} className="flex items-center hover:text-brand-purple transition-colors">
                            Total Hours
                            <SortIcon direction={sortColumn === 'total_hours' ? sortDirection : null} />
                          </button>
                        </th>
                      </>
                    ) : isStudentsData ? (
                      <>
                        <th className="py-2 pr-2 sm:pr-4 text-xs sm:text-sm">
                          <button onClick={() => handleSort('student_name')} className="flex items-center hover:text-brand-purple transition-colors">
                            Student Name
                            <SortIcon direction={sortColumn === 'student_name' ? sortDirection : null} />
                          </button>
                        </th>
                        <th className="py-2 pr-2 sm:pr-4 text-xs sm:text-sm hidden md:table-cell">
                          <button onClick={() => handleSort('client_name')} className="flex items-center hover:text-brand-purple transition-colors">
                            Client Name
                            <SortIcon direction={sortColumn === 'client_name' ? sortDirection : null} />
                          </button>
                        </th>
                        <th className="py-2 pr-2 sm:pr-4 text-xs sm:text-sm">
                          <button onClick={() => handleSort('lesson_count')} className="flex items-center hover:text-brand-purple transition-colors">
                            Lesson Count
                            <SortIcon direction={sortColumn === 'lesson_count' ? sortDirection : null} />
                          </button>
                        </th>
                      </>
                    ) : isAdhocPayData ? (
                      <>
                        <th className="py-2 pr-2 sm:pr-4 text-xs sm:text-sm">
                          <div className="flex flex-col gap-1">
                            <button onClick={() => handleSort('charge_id')} className="flex items-center hover:text-brand-purple transition-colors">
                              Charge ID
                              <SortIcon direction={sortColumn === 'charge_id' ? sortDirection : null} />
                            </button>
                          </div>
                        </th>
                        <th className="py-2 pr-2 sm:pr-4 text-xs sm:text-sm">
                          <div className="flex flex-col gap-1">
                            <button onClick={() => handleSort('description')} className="flex items-center hover:text-brand-purple transition-colors">
                              Description
                              <SortIcon direction={sortColumn === 'description' ? sortDirection : null} />
                            </button>
                          </div>
                        </th>
                        <th className="py-2 pr-2 sm:pr-4 text-xs sm:text-sm hidden sm:table-cell">
                          <div className="flex flex-col gap-0.5">
                            <div className="relative filter-dropdown-container">
                              <button
                                onClick={(e) => { e.stopPropagation(); setActiveFilterColumn(activeFilterColumn === 'category' ? null : 'category'); }}
                                className="p-0.5 rounded hover:bg-neutral-100 transition-colors"
                                title="Filter by Category"
                              >
                                <FilterIcon isActive={!!columnFilters.category} />
                              </button>
                              {activeFilterColumn === 'category' && (
                                <div className="absolute top-full left-0 mt-1 z-10 bg-white border border-neutral-200 rounded-md shadow-lg min-w-[150px] max-h-48 overflow-auto">
                                  <button
                                    onClick={() => handleFilterChange('category', '')}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-100"
                                  >
                                    Clear filter
                                  </button>
                                  {getUniqueValuesForColumn('category').map(value => (
                                    <button
                                      key={value}
                                      onClick={() => handleFilterChange('category', value)}
                                      className={classNames(
                                        "w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-100",
                                        columnFilters.category === value && "bg-purple-50 text-brand-purple"
                                      )}
                                    >
                                      {value}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button onClick={() => handleSort('category')} className="flex items-center hover:text-brand-purple transition-colors">
                              Category
                              <SortIcon direction={sortColumn === 'category' ? sortDirection : null} />
                            </button>
                          </div>
                        </th>
                        <th className="py-2 pr-2 sm:pr-4 text-xs sm:text-sm hidden md:table-cell">
                          <div className="flex flex-col gap-0.5">
                            <div className="relative filter-dropdown-container">
                              <button
                                onClick={(e) => { e.stopPropagation(); setActiveFilterColumn(activeFilterColumn === 'tutor' ? null : 'tutor'); }}
                                className="p-0.5 rounded hover:bg-neutral-100 transition-colors"
                                title="Filter by Tutor"
                              >
                                <FilterIcon isActive={!!columnFilters.tutor} />
                              </button>
                              {activeFilterColumn === 'tutor' && (
                                <div className="absolute top-full left-0 mt-1 z-10 bg-white border border-neutral-200 rounded-md shadow-lg min-w-[150px] max-h-48 overflow-auto">
                                  <button
                                    onClick={() => handleFilterChange('tutor', '')}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-100"
                                  >
                                    Clear filter
                                  </button>
                                  {getUniqueValuesForColumn('tutor').map(value => (
                                    <button
                                      key={value}
                                      onClick={() => handleFilterChange('tutor', value)}
                                      className={classNames(
                                        "w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-100",
                                        columnFilters.tutor === value && "bg-purple-50 text-brand-purple"
                                      )}
                                    >
                                      {value}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button onClick={() => handleSort('tutor')} className="flex items-center hover:text-brand-purple transition-colors">
                              Tutor
                              <SortIcon direction={sortColumn === 'tutor' ? sortDirection : null} />
                            </button>
                          </div>
                        </th>
                        <th className="py-2 pr-2 sm:pr-4 text-xs sm:text-sm hidden lg:table-cell">
                          <div className="flex flex-col gap-0.5">
                            <div className="relative filter-dropdown-container">
                              <button
                                onClick={(e) => { e.stopPropagation(); setActiveFilterColumn(activeFilterColumn === 'creator' ? null : 'creator'); }}
                                className="p-0.5 rounded hover:bg-neutral-100 transition-colors"
                                title="Filter by Creator"
                              >
                                <FilterIcon isActive={!!columnFilters.creator} />
                              </button>
                              {activeFilterColumn === 'creator' && (
                                <div className="absolute top-full left-0 mt-1 z-10 bg-white border border-neutral-200 rounded-md shadow-lg min-w-[150px] max-h-48 overflow-auto">
                                  <button
                                    onClick={() => handleFilterChange('creator', '')}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-100"
                                  >
                                    Clear filter
                                  </button>
                                  {getUniqueValuesForColumn('creator').map(value => (
                                    <button
                                      key={value}
                                      onClick={() => handleFilterChange('creator', value)}
                                      className={classNames(
                                        "w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-100",
                                        columnFilters.creator === value && "bg-purple-50 text-brand-purple"
                                      )}
                                    >
                                      {value}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button onClick={() => handleSort('creator')} className="flex items-center hover:text-brand-purple transition-colors">
                              Creator
                              <SortIcon direction={sortColumn === 'creator' ? sortDirection : null} />
                            </button>
                          </div>
                        </th>
                        <th className="py-2 pr-2 sm:pr-4 text-xs sm:text-sm">
                          <div className="flex flex-col gap-1">
                            <button onClick={() => handleSort('date')} className="flex items-center hover:text-brand-purple transition-colors">
                              Date Occurred
                              <SortIcon direction={sortColumn === 'date' ? sortDirection : null} />
                            </button>
                          </div>
                        </th>
                        <th className="py-2 pr-2 sm:pr-4 text-xs sm:text-sm">
                          <div className="flex flex-col gap-1">
                            <button onClick={() => handleSort('amount')} className="flex items-center hover:text-brand-purple transition-colors">
                              Amount Paid
                              <SortIcon direction={sortColumn === 'amount' ? sortDirection : null} />
                            </button>
                          </div>
                        </th>
                        <th className="py-2 pr-2 sm:pr-4 text-xs sm:text-sm hidden lg:table-cell">Labels</th>
                      </>
                    ) : (
                      <>
                        <th className="py-2 pr-2 sm:pr-4 text-xs sm:text-sm">
                          <button onClick={() => handleSort('lessonId')} className="flex items-center hover:text-brand-purple transition-colors">
                            Lesson
                            <SortIcon direction={sortColumn === 'lessonId' ? sortDirection : null} />
                          </button>
                        </th>
                        <th className="py-2 pr-2 sm:pr-4 text-xs sm:text-sm hidden sm:table-cell">
                          <button onClick={() => handleSort('jobName')} className="flex items-center hover:text-brand-purple transition-colors">
                            Job Name
                            <SortIcon direction={sortColumn === 'jobName' ? sortDirection : null} />
                          </button>
                        </th>
                        <th className="py-2 pr-2 sm:pr-4 text-xs sm:text-sm">
                          <button onClick={() => handleSort('date')} className="flex items-center hover:text-brand-purple transition-colors">
                            Date
                            <SortIcon direction={sortColumn === 'date' ? sortDirection : null} />
                          </button>
                        </th>
                        <th className="py-2 pr-2 w-16 sm:w-20 text-xs sm:text-sm">
                          <button onClick={() => handleSort('hours')} className="flex items-center hover:text-brand-purple transition-colors">
                            Hours
                            <SortIcon direction={sortColumn === 'hours' ? sortDirection : null} />
                          </button>
                        </th>
                        {isProfitData ? (
                          <th className="py-2 pr-2 sm:pr-4 text-xs sm:text-sm">
                            <button onClick={() => handleSort('profit')} className="flex items-center hover:text-brand-purple transition-colors">
                              Profit
                              <SortIcon direction={sortColumn === 'profit' ? sortDirection : null} />
                            </button>
                          </th>
                        ) : (
                          <>
                            <th className="py-2 pr-2 sm:pr-4 text-xs sm:text-sm">
                              <button onClick={() => handleSort('revenue')} className="flex items-center hover:text-brand-purple transition-colors">
                                Revenue
                                <SortIcon direction={sortColumn === 'revenue' ? sortDirection : null} />
                              </button>
                            </th>
                            {!isRevenueData && (
                              <>
                                <th className="py-2 pr-2 sm:pr-4 text-xs sm:text-sm hidden md:table-cell">
                                  <button onClick={() => handleSort('tutor')} className="flex items-center hover:text-brand-purple transition-colors">
                                    Tutor
                                    <SortIcon direction={sortColumn === 'tutor' ? sortDirection : null} />
                                  </button>
                                </th>
                                <th className="py-2 pr-2 sm:pr-4 text-xs sm:text-sm">
                                  <button onClick={() => handleSort('tutorPay')} className="flex items-center hover:text-brand-purple transition-colors">
                                    Tutor Pay
                                    <SortIcon direction={sortColumn === 'tutorPay' ? sortDirection : null} />
                                  </button>
                                </th>
                              </>
                            )}
                          </>
                        )}
                        <th className="py-2 pr-2 sm:pr-4 text-xs sm:text-sm hidden lg:table-cell">Labels</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-neutral-500">
                        <div className="flex flex-col items-center gap-2">
                          <svg className="w-12 h-12 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="text-sm">No data available for this filter</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredRows.map((r, idx) => {
                    // Ensure r is a valid object
                    if (!r || typeof r !== 'object') {
                      return (
                        <tr key={idx} className="border-t border-neutral-100">
                          <td className="py-6 text-center text-neutral-500" colSpan={8}>Invalid data row</td>
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
                          <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm hidden md:table-cell">
                            {r.client_name || r.clientName || ''}
                          </td>
                          <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm">
                            {r.lesson_count || r.lessonCount || 0}
                          </td>
                        </tr>
                      );
                    }
                    
                    if (isAdhocPayData) {
                      return (
                        <tr key={idx} className="border-t border-neutral-100">
                          <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm">
                            {r.charge_id ? (
                              <a
                                href={`https://account.acmeops.com/accounting/adhoccharges/${r.charge_id}/`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-brand-purple hover:underline font-medium"
                              >
                                {r.charge_id}
                              </a>
                            ) : ''}
                          </td>
                          <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm">
                            <div className="max-w-xs truncate" title={r.description || ''}>
                              {r.description || ''}
                            </div>
                          </td>
                          <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm hidden sm:table-cell">{r.category_name || ''}</td>
                          <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm hidden md:table-cell">{r.contractor_name || ''}</td>
                          <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm hidden lg:table-cell">{r.creator_name || ''}</td>
                          <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm">
                            {r.date_occurred ? new Date(r.date_occurred).toLocaleDateString() : ''}
                          </td>
                          <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm font-medium">
                            ${Number(r.pay_contractor ?? 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </td>
                          <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm hidden lg:table-cell">
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
                                  labels = [labels];
                                }
                              }
                              
                              if (Array.isArray(labels) && labels.length > 0) {
                                return (
                                  <div className="flex flex-wrap gap-1">
                                    {labels.map((label, labelIdx) => {
                                      const labelName = typeof label === 'object' ? label.name || label : label;
                                      return (
                                        <span
                                          key={labelIdx}
                                          className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded"
                                        >
                                          {labelName}
                                        </span>
                                      );
                                    })}
                                  </div>
                                );
                              }
                              
                              return <span className="text-neutral-400">—</span>;
                            })()}
                          </td>
                        </tr>
                      );
                    } else {
                      const revenue = Number(r.revenue ?? 0);
                      const tutorPay = Number(r.tutorPay ?? 0);
                      const profit = revenue - tutorPay;
                      
                      return (
                        <tr key={idx} className="border-t border-neutral-100">
                          <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm">
                            {r.lessonId ? (
                              <a
                                href={`https://account.acmeops.com/cal/appointments/${r.lessonId}/`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-brand-purple hover:underline"
                              >
                                {r.lessonId}
                              </a>
                            ) : null}
                          </td>
                          <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm hidden sm:table-cell">{r.jobName || ''}</td>
                          <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm">{r.date || ''}</td>
                          <td className="py-2 pr-2 text-neutral-800 whitespace-nowrap text-xs sm:text-sm">{Number(r.hours || 0).toFixed(2)}</td>
                          {isProfitData ? (
                            <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm">${profit.toFixed(2)}</td>
                          ) : (
                            <>
                              <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm">${revenue.toFixed(2)}</td>
                              {!isRevenueData && (
                                <>
                                  <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm hidden md:table-cell">{r.tutorName || ''}</td>
                                  <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm">${tutorPay.toFixed(2)}</td>
                                </>
                              )}
                            </>
                          )}
                          <td className="py-2 pr-2 sm:pr-4 text-neutral-800 text-xs sm:text-sm hidden lg:table-cell">
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
                                  // Filter out "First Lesson Complete" labels
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
                                    {labelsToShow.map((label, labelIdx) => (
                                      <span key={labelIdx} className="inline-block px-2 py-1 text-xs bg-neutral-100 text-neutral-700 rounded">
                                        {typeof label === 'object' ? (label.name || label) : label}
                                      </span>
                                    ))}
                                  </div>
                                );
                              }
                              
                              return <span className="text-neutral-400">—</span>;
                            })()}
                          </td>
                        </tr>
                      );
                    }
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


const dummyRows = Array.from({ length: 20 }).map((_, i) => ({
  lesson: `Lesson ${i + 1}`,
  student: ["Alice", "Bob", "Charlie", "Dana"][i % 4],
  date: `2025-09-${(i % 28) + 1}`,
  hours: (1 + (i % 3) * 0.5).toFixed(1),
  revenue: 80 + (i % 5) * 20,
  tutorPay: 40 + (i % 4) * 10,
  ltv: 300 + (i % 7) * 200,
}));


export default function AnalyticsDashboard() {
  // View-level state (Historical vs Forecast) - persisted in localStorage
  const [activeView, setActiveView] = useState(() => {
    const saved = localStorage.getItem("analytics_active_view");
    return saved && ["historical", "forecast"].includes(saved) ? saved : "historical";
  });

  // Persist activeView changes to localStorage
  useEffect(() => {
    localStorage.setItem("analytics_active_view", activeView);
  }, [activeView]);

  const [activeTab, setActiveTab] = useState("All");
  const [dateRangeValue, setDateRangeValue] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [alertFlags, setAlertFlags] = useState({ unlabeledInvoice: false, fetchError: false });

  const [allLabels, setAllLabels] = useState([]);
  const [selectedJobLabelIds, setSelectedJobLabelIds] = useState([]);
  const [selectedTutorLabelIds, setSelectedTutorLabelIds] = useState([]);
  const [labelConfigOpen, setLabelConfigOpen] = useState(false);
  const [jobLabelSelectorOpen, setJobLabelSelectorOpen] = useState(false);
  const [tutorLabelSelectorOpen, setTutorLabelSelectorOpen] = useState(false);
  const [labelPreferences, setLabelPreferences] = useState({
    visibleLabels: [],
    showAll: true,
    lastUpdated: null
  });

  // Helper function to convert label IDs to label names (handles synthetic tutor filters)
  const getLabelNamesFromIds = (labelIds, allLabels) => {
    if (!labelIds || labelIds.length === 0) return [];
    
    // Map synthetic tutor filter IDs to their names (using string keys only)
    const syntheticLabelMap = {
      '-1001': 'Tutor - LA',
      '-1002': 'Tutor - NYC',
      '-1003': 'Tutor - SF',
    };
    
    if (!allLabels || allLabels.length === 0) {
      console.warn('⚠️ No labels loaded, checking for synthetic labels only');
      // Still return synthetic labels even if allLabels is empty
      return labelIds.map(id => {
        const idStr = String(id);
        return syntheticLabelMap[idStr] || null;
      }).filter(name => name !== null);
    }
    
    const labelNames = labelIds.map(id => {
      // Check for synthetic labels first (convert to string for lookup)
      const idStr = String(id);
      if (syntheticLabelMap[idStr]) {
        return syntheticLabelMap[idStr];
      }
      
      // Then check regular labels
      const idNum = typeof id === 'string' ? parseInt(id, 10) : Number(id);
      const label = allLabels.find(l => {
        const lid = typeof l.id === 'string' ? parseInt(l.id, 10) : Number(l.id);
        return lid === idNum;
      });
      if (!label) {
        console.warn('⚠️ Label not found for ID:', id);
      }
      return label?.name || null;
    }).filter(Boolean);
    
    return labelNames;
  };

  // Helper function to combine job and tutor labels for API calls
  const getAllSelectedLabelNames = () => {
    const jobLabelNames = getLabelNamesFromIds(selectedJobLabelIds, allLabels);
    const tutorLabelNames = getLabelNamesFromIds(selectedTutorLabelIds, allLabels);
    return [...jobLabelNames, ...tutorLabelNames];
  };

  const [loading, setLoading] = useState(false);
  const [serverData, setServerData] = useState(null);
  const [trends, setTrends] = useState({ loading: false, error: null, series: [] });
  const { companyName } = useCompanyName();
  const now = new Date();

  // Helper to get fiscal quarter dates (FY runs Jul-Jun)
  // Q1=Jul-Sep, Q2=Oct-Dec, Q3=Jan-Mar, Q4=Apr-Jun
  const getCurrentQuarterDates = (date) => {
    const month = date.month;
    let quarterStart, quarterEnd;

    if (month >= 1 && month <= 3) {
      // Q3 FY (Jan-Mar)
      quarterStart = date.set({ month: 1, day: 1 });
      quarterEnd = date.set({ month: 3, day: 31 });
    } else if (month >= 4 && month <= 6) {
      // Q4 FY (Apr-Jun)
      quarterStart = date.set({ month: 4, day: 1 });
      quarterEnd = date.set({ month: 6, day: 30 });
    } else if (month >= 7 && month <= 9) {
      // Q1 FY (Jul-Sep)
      quarterStart = date.set({ month: 7, day: 1 });
      quarterEnd = date.set({ month: 9, day: 30 });
    } else {
      // Q2 FY (Oct-Dec)
      quarterStart = date.set({ month: 10, day: 1 });
      quarterEnd = date.set({ month: 12, day: 31 });
    }

    return { quarterStart, quarterEnd };
  };

  // Initialize date range based on active view
  // Forecast defaults to current quarter, Historical defaults to current month
  useEffect(() => {
    if (!dateRangeValue) {
      const now = DateTime.now().setZone("America/New_York");

      if (activeView === "forecast") {
        const { quarterStart, quarterEnd } = getCurrentQuarterDates(now);
        setDateRangeValue({
          startDate: quarterStart.toISODate(),
          endDate: quarterEnd.toISODate(),
          preset: 'currentQuarter'
        });
      } else {
        setDateRangeValue({
          startDate: now.startOf("month").toISODate(),
          endDate: now.endOf("month").toISODate(),
          preset: 'thisMonth'
        });
      }
    }
  }, []);

  // Update date range when switching between Historical and Forecast tabs
  // Forecast uses current quarter, Historical uses current month
  useEffect(() => {
    const now = DateTime.now().setZone("America/New_York");

    if (activeView === "forecast") {
      const { quarterStart, quarterEnd } = getCurrentQuarterDates(now);
      setDateRangeValue({
        startDate: quarterStart.toISODate(),
        endDate: quarterEnd.toISODate(),
        preset: 'currentQuarter'
      });
    } else {
      // Historical: default to current month
      setDateRangeValue({
        startDate: now.startOf("month").toISODate(),
        endDate: now.endOf("month").toISODate(),
        preset: 'thisMonth'
      });
    }
  }, [activeView]);


  // Tutor hour buckets drilldown state
  const [tutorBucketsData, setTutorBucketsData] = useState(null);
  const [tutorBucketsLoading, setTutorBucketsLoading] = useState(false);
  const [tutorDrilldownOpen, setTutorDrilldownOpen] = useState(false);
  const [selectedBucketData, setSelectedBucketData] = useState(null);

  // Load label preferences from localStorage on component mount
  useEffect(() => {
    const savedPreferences = localStorage.getItem('labelPreferences');
    if (savedPreferences) {
      try {
        const prefs = JSON.parse(savedPreferences);
        // Normalize IDs to numbers for consistency
        const normalizedPrefs = {
          ...prefs,
          visibleLabels: (prefs.visibleLabels || []).map(id => 
            typeof id === 'string' ? parseInt(id, 10) : id
          ).filter(id => !isNaN(id))
        };
        setLabelPreferences(normalizedPrefs);
        // Note: visibleLabels are for display preferences, not filter selections
        // Filter selections are managed separately via selectedJobLabelIds and selectedTutorLabelIds
      } catch (error) {
        console.error('Error parsing saved label preferences:', error);
      }
    }
  }, []);

  // Fetch labels from API on component mount
  useEffect(() => {
    const fetchLabels = async () => {
      try {
        const response = await fetch('/api/labels');
        if (response.ok) {
          const data = await response.json();
          const labels = data.labels || [];
          console.log('✅ Loaded labels:', labels.length, 'labels');
          setAllLabels(labels);
        } else {
          console.error('❌ Failed to fetch labels:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('❌ Error fetching labels:', error);
      }
    };

    fetchLabels();
  }, []);

  // Save label preferences to localStorage
  const handleLabelPreferencesSave = (preferences) => {
    // Normalize IDs to numbers for consistency
    const normalizedPrefs = {
      ...preferences,
      visibleLabels: (preferences.visibleLabels || []).map(id => 
        typeof id === 'string' ? parseInt(id, 10) : id
      ).filter(id => !isNaN(id))
    };
    console.log('💾 AnalyticsDashboard - Saving label preferences:', normalizedPrefs);
    console.log('💾 AnalyticsDashboard - Selected label IDs:', normalizedPrefs.visibleLabels);
    console.log('💾 AnalyticsDashboard - All labels available:', allLabels.length);
    console.log('💾 AnalyticsDashboard - Checking if labels exist:', normalizedPrefs.visibleLabels.map(id => {
      const found = allLabels.find(l => {
        const lid = typeof l.id === 'string' ? parseInt(l.id, 10) : l.id;
        return lid === id;
      });
      return { id, found: !!found, name: found?.name || 'NOT FOUND' };
    }));
    
    setLabelPreferences(normalizedPrefs);
    // Note: visibleLabels are for display preferences, not filter selections
    // Filter selections are managed separately via selectedJobLabelIds and selectedTutorLabelIds
    localStorage.setItem('labelPreferences', JSON.stringify(normalizedPrefs));
    
    // Force a re-render check
    setTimeout(() => {
      console.log('✅ After save - selectedLabelIds:', normalizedPrefs.visibleLabels);
      console.log('✅ After save - allLabels count:', allLabels.length);
    }, 100);
  };

  // Label toggle functions for job and tutor labels separately
  const toggleJobLabel = (labelId) => {
    setSelectedJobLabelIds(prev => {
      const labelIdNum = typeof labelId === 'string' ? parseInt(labelId, 10) : labelId;
      const prevNums = prev.map(id => typeof id === 'string' ? parseInt(id, 10) : id);
      
      return prevNums.includes(labelIdNum)
        ? prev.filter(id => {
            const idNum = typeof id === 'string' ? parseInt(id, 10) : id;
            return idNum !== labelIdNum;
          })
        : [...prev, labelIdNum];
    });
  };

  const toggleTutorLabel = (labelId) => {
    setSelectedTutorLabelIds(prev => {
      const labelIdNum = typeof labelId === 'string' ? parseInt(labelId, 10) : labelId;
      const prevNums = prev.map(id => typeof id === 'string' ? parseInt(id, 10) : id);
      
      return prevNums.includes(labelIdNum)
        ? prev.filter(id => {
            const idNum = typeof id === 'string' ? parseInt(id, 10) : id;
            return idNum !== labelIdNum;
          })
        : [...prev, labelIdNum];
    });
  };

  // Handlers for job and tutor label selector modals
  const handleJobLabelsSave = (selectedIds) => {
    setSelectedJobLabelIds(selectedIds);
  };

  const handleTutorLabelsSave = (selectedIds) => {
    setSelectedTutorLabelIds(selectedIds);
  };

  // Compute date range from DateRangePicker value
  const computeRange = () => {
    if (dateRangeValue && dateRangeValue.startDate && dateRangeValue.endDate) {
      // DateRangePicker provides inclusive dates in YYYY-MM-DD format
      // Convert to EST at start of day, then to UTC ISO for API
      const start = DateTime.fromISO(dateRangeValue.startDate, { zone: "America/New_York" })
        .startOf('day')
        .toUTC()
        .toJSDate();
      
      // End date is inclusive from DateRangePicker, convert to exclusive (start of next day)
      const end = DateTime.fromISO(dateRangeValue.endDate, { zone: "America/New_York" })
        .startOf('day')
        .plus({ days: 1 })
        .toUTC()
        .toJSDate();
      
      return { start, end };
    }
    // Fallback to current month
    const anchor = DateTime.now().setZone("America/New_York");
    const start = anchor.startOf('month').toUTC().toJSDate();
    const end = anchor.endOf('month').plus({ days: 1 }).startOf('day').toUTC().toJSDate();
    return { start, end };
  };

  const { start: rangeStartDate, end: rangeEndDate } = useMemo(() => computeRange(), [dateRangeValue]);
  const isFutureRange = rangeStartDate > now;
  
  // Determine timeView from date range for API compatibility
  const getTimeViewFromRange = () => {
    if (!dateRangeValue || !dateRangeValue.startDate || !dateRangeValue.endDate) return 'monthly';
    const daysDiff = Math.round((rangeEndDate - rangeStartDate) / (1000 * 60 * 60 * 24));
    if (daysDiff <= 14) return 'weekly';
    if (daysDiff <= 93) return 'monthly'; // ~3 months
    return 'yearly';
  };
  const timeView = getTimeViewFromRange();


  // Fetch enhanced tutor hour buckets data
  const fetchTutorBuckets = useMemo(() => async () => {
    setTutorBucketsLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: rangeStartDate.toISOString(),
        endDate: rangeEndDate.toISOString(),
        timeView: timeView
      });

      const response = await fetch(`/api/tutor-hour-buckets?${params}`, { credentials: 'include' });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Tutor hour buckets API error:', { status: response.status, error: errorText });
        throw new Error(`Failed to fetch tutor hour buckets: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      setTutorBucketsData(data);
    } catch (error) {
      console.error('Error fetching tutor hour buckets:', error);
      setTutorBucketsData(null);
    } finally {
      setTutorBucketsLoading(false);
    }
  }, [rangeStartDate.toISOString(), rangeEndDate.toISOString(), timeView]);

  // Fetch tutor buckets when date range or time view changes
  useEffect(() => {
    if (activeTab === 'All') { // Only for All tab
      fetchTutorBuckets();
    }
  }, [activeTab, fetchTutorBuckets]);

  // Removed old tutorBucketData useMemo - now using tutorBucketsData.buckets directly

  const [detailRows, setDetailRows] = useState([]);
  
  // Handle tutor bucket bar click
  const handleTutorBucketClick = (data) => {
    if (data && data.tutors && data.tutors.length > 0) {
      setSelectedBucketData(data);
      setTutorDrilldownOpen(true);
    }
  };

  // Update selectedBucketData when tutorBucketsData refreshes (e.g., after applying bonus)
  useEffect(() => {
    if (tutorDrilldownOpen && selectedBucketData && tutorBucketsData?.buckets) {
      // Find the matching bucket in the refreshed data
      const updatedBucket = tutorBucketsData.buckets.find(
        bucket => bucket.name === selectedBucketData.name
      );
      if (updatedBucket) {
        setSelectedBucketData(updatedBucket);
      }
    }
  }, [tutorBucketsData, tutorDrilldownOpen, selectedBucketData]);

  const openDrilldown = async (title, metric) => {
    setModalTitle(title);
    setModalOpen(true);
    try {
      // Use master-report-details for exact alignment and custom ranges
      const metricMap = {
        lessons: 'lessons',
        hours: 'hours',
        students: 'students',
        revenue: 'revenue',
        tutorpay: 'expectedTutorPay',
        tutorpayexpected: 'expectedTutorPay',
        activetutors: 'activeTutors',
      };
      const m = metricMap[metric] || metric;
      if (!m) {
        console.error('No metric provided for drilldown');
        setDetailRows(dummyRows);
        return;
      }
      // Format dates as YYYY-MM-DD to avoid timezone issues
      // Convert Date objects back to EST and extract components
      const formatDateOnly = (date) => {
        // Convert JSDate to EST using Luxon to extract the correct date
        const estDate = DateTime.fromJSDate(date).setZone("America/New_York");
        return estDate.toISODate();
      };
      
      const params = {
        metric: m,
        startDate: formatDateOnly(rangeStartDate),
        endDate: formatDateOnly(rangeEndDate),
        tab: activeTab.toLowerCase(),
      };
      
      // Handle special tabs that need specific labels
      if (activeTab === "First Lesson Complete") {
        params.labels = "First Lesson Complete";
        params.onlyLabel = "true"; // Special flag to indicate we want ONLY this label
      } else {
        // Combine job and tutor labels
        const allLabelNames = getAllSelectedLabelNames();
        if (allLabelNames.length > 0) {
          params.labels = allLabelNames.join(',');
        }
      }
      const qs = new URLSearchParams(params).toString();
      const resp = await fetch(`/api/master-report-details?${qs}`, {
        credentials: 'include',
      });
      if (!resp.ok) {
        console.error(`API request failed with status ${resp.status}`);
        setDetailRows(dummyRows);
        return;
      }
      const json = await resp.json();
      const rows = Array.isArray(json.rows) ? json.rows : [];
      
      // Handle empty or invalid data gracefully - show empty state, not dummy data
      if (rows.length === 0) {
        setDetailRows([]);
        return;
      }
      
      // Check if this is students data first
      const isStudentsData = rows.length > 0 && rows[0] && ('student_name' in rows[0] || 'studentName' in rows[0]) && ('lesson_count' in rows[0] || 'lessonCount' in rows[0]);
      
      // Check if this is active tutors data
      const isActiveTutorsData = rows.length > 0 && rows[0] && ('tutor_name' in rows[0] || 'tutorName' in rows[0]) && ('completed_lessons' in rows[0] || 'completedLessons' in rows[0]);
      
      // Check if this is hours data (tutor-focused hours view)
      const isHoursData = rows.length > 0 && rows[0] && ('tutor_name' in rows[0] || 'tutorName' in rows[0]) && ('total_hours' in rows[0] || 'totalHours' in rows[0]);
      
      if (isStudentsData) {
        // For students data, sort by lesson count (highest first)
        rows.sort((a, b) => {
          const lessonsA = Number(a.lesson_count || a.lessonCount || 0);
          const lessonsB = Number(b.lesson_count || b.lessonCount || 0);
          return lessonsB - lessonsA; // Descending order
        });
        setDetailRows(rows);
        return;
      }
      
      if (isActiveTutorsData) {
        // For active tutors, sort by completed lessons (highest first)
        rows.sort((a, b) => {
          const lessonsA = Number(a.completed_lessons || a.completedLessons || 0);
          const lessonsB = Number(b.completed_lessons || b.completedLessons || 0);
          return lessonsB - lessonsA; // Descending order
        });
        setDetailRows(rows);
        return;
      }
      
      if (isHoursData) {
        // For hours data, sort by total hours (highest first)
        rows.sort((a, b) => {
          const hoursA = Number(a.total_hours || a.totalHours || 0);
          const hoursB = Number(b.total_hours || b.totalHours || 0);
          return hoursB - hoursA; // Descending order
        });
        setDetailRows(rows);
        return;
      }
      
      // Sort ascending (earliest first), then normalize for other data types
      rows.sort((a, b) => {
        const dateA = new Date(a.start || a.lesson_start || a.date_sent || 0);
        const dateB = new Date(b.start || b.lesson_start || b.date_sent || 0);
        return dateA - dateB;
      });
      
      const formatHours = (v) => {
        const num = Number(v);
        if (!Number.isFinite(num)) return "0";
        const rounded = Math.round(num * 1000) / 1000; // max 3 decimals
        return String(rounded);
      };
      
      // Check if this is adhoc charge data
      const isAdhocData = rows.length > 0 && rows[0] && 'charge_id' in rows[0];
      
      const normalized = isAdhocData ? rows : rows.map((r) => ({
        // unified fields consumed by DataModal
        lessonId: r.appointment_id ?? r.lesson_id ?? r.lessonId ?? r.lessonid ?? null,
        lesson: r.appointment_id ?? r.lesson ?? '',
        jobName: r.topic ?? r.service_name ?? r.jobName ?? r.job_name ?? '',
        date: new Date(r.start || r.lesson_start || r.date_sent || r.date || Date.now()).toLocaleDateString(),
        hours: formatHours(r.hours ?? r.units ?? r.lesson_hours ?? r.duration_hours ?? 0),
        revenue: Number(r.revenue ?? r.expected_revenue ?? r.paid_amount ?? 0),
        tutorName: r.contractor_name ?? r.tutorName ?? r.tutor ?? '',
        tutorPay: Number(r.tutorPay ?? r.expected_tutor_pay ?? r.tutor_pay ?? 0),
        service_labels: r.service_labels ?? null,
        ltv: 0,
      }));
      setDetailRows(normalized);
    } catch (e) {
      console.error('Failed to load detail:', e);
      setDetailRows(dummyRows);
    }
  };

  const kpiCards = (
    <div className="flex items-center justify-center py-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      <span className="ml-2 text-sm text-neutral-600">Loading KPI data...</span>
    </div>
  );

  const showClientTracker = ["Home", "Online", "Clubs"].includes(activeTab);

  React.useEffect(() => {
    const controller = new AbortController();
    async function fetchAnalytics() {
      setLoading(true);
      try {
        const params = {
          tab: activeTab.toLowerCase(),
          view: timeView.toLowerCase(),
          start: rangeStartDate.toISOString(),
          end: rangeEndDate.toISOString(),
        };
        
        // Convert selected label IDs to label names for the API
        // Handle special tabs that need specific labels
        if (activeTab === "First Lesson Complete") {
          params.labels = "First Lesson Complete";
          params.onlyLabel = "true"; // Special flag to indicate we want ONLY this label
        } else {
          // Get manually selected labels (from label selector modals)
          const allLabelNames = getAllSelectedLabelNames();
          
          // Only send labels if manually selected via label selector
          // When only a tab is selected (no manual labels), let the backend handle it via the tab parameter
          // This allows the backend to use OR logic for tab labels (any label in the group matches)
          if (allLabelNames.length > 0) {
            params.labels = allLabelNames.join(',');
            console.log('📊 Using manually selected labels:', allLabelNames);
          }
          // If no manual labels are selected, the backend will use the tab parameter
          // which correctly uses OR logic for tab label groups
        }
        
        // Debug logging removed
        
        const qs = new URLSearchParams(params).toString();
        const resp = await fetch(`/api/analytics?${qs}`, {
          signal: controller.signal,
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!resp.ok) {
          console.error(`Analytics API failed with status ${resp.status}`);
          throw new Error(`HTTP ${resp.status}`);
        }
        const json = await resp.json();
        
        // Validate the response structure
        if (!json || typeof json !== 'object') {
          console.error('Invalid analytics response structure');
          throw new Error('Invalid response format');
        }
        
        setServerData(json);
        const warn = json?.meta?.warnings || {};
        setAlertFlags({ unlabeledInvoice: !!warn.unlabeledInvoice, fetchError: !!warn.partialData });
      } catch (e) {
        if (e.name === 'AbortError') return;
        console.error('Failed to fetch /api/analytics:', e);
        setServerData(null);
        setAlertFlags({ unlabeledInvoice: false, fetchError: true });
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
    return () => controller.abort();
  }, [activeTab, dateRangeValue, selectedJobLabelIds, selectedTutorLabelIds, allLabels]);

  // Fetch trends series whenever filters or view change
  // Delay trends fetch slightly to prioritize main analytics data
  React.useEffect(() => {
    let aborted = false;
    // Small delay to let main analytics load first
    const timeoutId = setTimeout(() => {
      async function fetchTrends() {
        if (aborted) return;
        setTrends((t) => ({ ...t, loading: true, error: null }));
        try {
        // For trends, always use monthly view to show wave pattern even when yearly date range is selected
        const trendsView = timeView.toLowerCase() === 'yearly' ? 'monthly' : timeView.toLowerCase();
        const params = {
          tab: activeTab.toLowerCase(),
          view: trendsView,
        };
        params.start = rangeStartDate.toISOString();
        params.end = rangeEndDate.toISOString();
        
        // Convert selected label IDs to label names for the API
        if (activeTab === "First Lesson Complete") {
          params.labels = "First Lesson Complete";
          params.onlyLabel = "true";
        } else {
          // Get manually selected labels (from label selector modals)
          const allLabelNames = getAllSelectedLabelNames();
          
          // Only send labels if manually selected via label selector
          // When only a tab is selected (no manual labels), let the backend handle it via the tab parameter
          // This allows the backend to use OR logic for tab labels (any label in the group matches)
          if (allLabelNames.length > 0) {
            params.labels = allLabelNames.join(',');
          }
          // If no manual labels are selected, the backend will use the tab parameter
          // which correctly uses OR logic for tab label groups
        }

        const qs = new URLSearchParams(params).toString();

        const resp = await fetch(`/api/analytics/trends?${qs}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
          if (!aborted) setTrends({ loading: false, error: null, series: Array.isArray(json.series) ? json.series : [] });
        } catch (e) {
          if (aborted) return;
          setTrends({ loading: false, error: e?.message || 'Failed to load trends', series: [] });
        }
      }
      fetchTrends();
    }, 500); // 500ms delay to prioritize main analytics data
    
    return () => { 
      aborted = true;
      clearTimeout(timeoutId);
    };
  }, [activeTab, dateRangeValue, selectedJobLabelIds, selectedTutorLabelIds, allLabels, rangeStartDate, rangeEndDate]);

  const totals = serverData?.totals;

  // Add projected values to trends data for current month (similar to marketing analytics)
  const trendsWithProjections = useMemo(() => {
    if (!trends.series || trends.series.length === 0) {
      return trends.series;
    }
    
    // Check if the data is monthly by examining the periodStart dates
    // If periods are roughly 1 month apart, treat as monthly data
    // This allows projections to work even when timeView is 'yearly' but data is monthly
    const isMonthlyData = trends.series.length > 1 && (() => {
      const first = DateTime.fromISO(trends.series[0].periodStart);
      const second = DateTime.fromISO(trends.series[1].periodStart);
      const daysDiff = Math.abs(second.diff(first, 'days').days);
      // Monthly data should have periods roughly 28-31 days apart
      return daysDiff >= 25 && daysDiff <= 35;
    })();
    
    // Apply projections for monthly data (regardless of timeView setting)
    // or if timeView is explicitly 'monthly'
    if (!isMonthlyData && timeView !== 'monthly') {
      return trends.series;
    }

    const now = DateTime.now().setZone('America/New_York');
    const currentMonthStart = now.startOf('month');
    
    // Find the current month index in the series
    // Handle both UTC and timezone-aware periodStart dates
    let currentMonthIndex = -1;
    trends.series.forEach((period, index) => {
      // periodStart is in ISO format, parse it and convert to NY timezone for comparison
      const periodDate = DateTime.fromISO(period.periodStart).setZone('America/New_York');
      const periodMonthStart = periodDate.startOf('month');
      
      // Compare year and month
      if (periodMonthStart.year === currentMonthStart.year && 
          periodMonthStart.month === currentMonthStart.month) {
        currentMonthIndex = index;
      }
    });
    
    // Debug logging (can be removed later)
    console.log('Trends projection debug:', {
      currentMonth: `${currentMonthStart.year}-${currentMonthStart.month}`,
      currentMonthIndex,
      seriesLength: trends.series.length,
      lastPeriod: trends.series[trends.series.length - 1]?.periodStart,
      isMonthlyData
    });

    // If current month not found, still add projected values (set to actual)
    // This ensures the projected lines render even if we can't find the current month
    if (currentMonthIndex === -1) {
      console.log('Current month not found in trends series, setting projected = actual');
      return trends.series.map(period => ({
        ...period,
        revenueProjected: period.revenue || 0,
        profitProjected: period.profit || 0,
        marginPctProjected: period.marginPct || 0,
      }));
    }

    // Enrich series with projections
    // Strategy: Set projected = actual for last 2-3 months before current month
    // This ensures Recharts has enough points to render the projected line
    const enrichedSeries = trends.series.map((period, index) => {
      // For months before the last 2 months, no projected values
      if (index < currentMonthIndex - 2) {
        return {
          ...period,
          revenueProjected: null,
          profitProjected: null,
          marginPctProjected: null,
        };
      } else if (index >= currentMonthIndex - 2 && index < currentMonthIndex) {
        // For the last 2-3 months before current, set projected = actual
        // This creates a visible connection point for the projected line
        return {
          ...period,
          revenueProjected: period.revenue || 0,
          profitProjected: period.profit || 0,
          marginPctProjected: period.marginPct || 0,
        };
      } else if (index === currentMonthIndex) {
        // For current month, calculate projected values
        const previousPeriod = index > 0 ? trends.series[index - 1] : null;
        if (!previousPeriod) {
          // No previous data, use current values
          return {
            ...period,
            revenueProjected: period.revenue || 0,
            profitProjected: period.profit || 0,
            marginPctProjected: period.marginPct || 0,
          };
        }

        const dayOfMonth = now.day;
        const daysInMonth = now.daysInMonth;

        const currentRevenue = Number(period.revenue || 0);
        const currentProfit = Number(period.profit || 0);

        // Calculate projected values based on current day of month
        // Formula: (current value / days elapsed) * total days in month
        // On day 1: divide by 1, multiply by days in month
        // On day 13: divide by 13, multiply by days in month
        let revenueProjected, profitProjected, marginPctProjected;

        if (dayOfMonth > 0) {
          // Calculate daily rate and project to end of month
          // This handles day 1 (divide by 1), day 13 (divide by 13), etc.
          const dailyRevenueRate = currentRevenue / dayOfMonth;
          revenueProjected = dailyRevenueRate * daysInMonth;
          
          const dailyProfitRate = currentProfit / dayOfMonth;
          profitProjected = dailyProfitRate * daysInMonth;
          
          // Calculate margin from projected revenue and profit
          marginPctProjected = revenueProjected > 0 ? (profitProjected / revenueProjected) * 100 : 0;
        } else {
          // Edge case: dayOfMonth is 0 (shouldn't happen, but handle gracefully)
          // Use previous month's values as baseline
          revenueProjected = previousPeriod.revenue || 0;
          profitProjected = previousPeriod.profit || 0;
          marginPctProjected = previousPeriod.marginPct || 0;
        }

        const projectedPeriod = {
          ...period,
          revenueProjected: Math.max(0, revenueProjected),
          profitProjected: Math.max(0, profitProjected),
          marginPctProjected: Math.max(0, marginPctProjected),
        };
        
        // Debug logging for current month projection
        const periodDate = DateTime.fromISO(period.periodStart).setZone('America/New_York');
        console.log('Current month projection calculated:', {
          period: periodDate.toFormat('MMM yyyy'),
          dayOfMonth,
          daysInMonth,
          currentRevenue,
          currentProfit,
          revenueProjected: projectedPeriod.revenueProjected,
          profitProjected: projectedPeriod.profitProjected,
          marginPctProjected: projectedPeriod.marginPctProjected,
          previousRevenue: previousPeriod.revenue,
          previousProfit: previousPeriod.profit,
        });
        
        return projectedPeriod;
      } else {
        // For future months, no projected values
        return period;
      }
    });

    return enrichedSeries;
  }, [trends.series, timeView]);

  return (
    <div className="space-y-3">
      {/* View-level tab switcher (Historical vs Forecast) */}
      <div className="pt-2">
        <ViewTabSwitcher activeView={activeView} onChange={setActiveView} />
      </div>

      {/* Forecast View */}
      {activeView === "forecast" && (
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
              <p className="mt-4 text-neutral-600">Loading forecast...</p>
            </div>
          </div>
        }>
          <ForecastDashboard />
        </Suspense>
      )}

      {/* Historical View */}
      {activeView === "historical" && (
        <>
          {(alertFlags.unlabeledInvoice || alertFlags.fetchError) && (
            <div
              role="alert"
              aria-live="polite"
              className={classNames(
                "flex items-center gap-3 p-3 rounded-lg border text-sm",
                alertFlags.fetchError ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"
              )}
            >
              <ExclamationTriangleIcon className="h-5 w-5" />
              {alertFlags.fetchError ? "Data fetch failed or metrics may be incomplete." : "Warning: Invoices created without a job label detected."}
              {serverData?.meta?.warnings?.unlabeledInvoice && (
                <span className="ml-auto text-xs text-amber-700">Unlabeled revenue present</span>
              )}
            </div>
          )}

          {/* Filters and Controls Section */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Left Side: Filter Chips and Labels */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <TabSwitcher 
          activeTab={activeTab} 
          onChange={(t) => { setActiveTab(t); }} 
          onJobLabelsClick={() => setJobLabelSelectorOpen(true)}
          onTutorLabelsClick={() => setTutorLabelSelectorOpen(true)}
        />
          {/* Selected Job Label Chips */}
          {selectedJobLabelIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedJobLabelIds.map((labelId) => {
                const label = allLabels.find(l => {
                  const lid = typeof l.id === 'string' ? parseInt(l.id, 10) : Number(l.id);
                  const idNum = typeof labelId === 'string' ? parseInt(labelId, 10) : Number(labelId);
                  return lid === idNum;
                });
                if (!label) return null;
                return (
                  <div
                    key={label.id}
                    className="inline-flex items-center gap-1 px-2 py-1.5 sm:py-1 rounded-md text-xs bg-blue-600 text-white border border-blue-600 group touch-manipulation min-h-[44px] sm:min-h-0"
                  >
                    <span className="max-w-[150px] truncate">{label.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleJobLabel(label.id);
                      }}
                      className="ml-0.5 hover:bg-white/20 active:bg-white/30 rounded p-0.5 transition-colors flex items-center justify-center touch-manipulation"
                      title="Remove filter"
                    >
                      <XMarkIcon className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          
          {/* Selected Tutor Label Chips */}
          {selectedTutorLabelIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedTutorLabelIds.map((labelId) => {
                const idNum = typeof labelId === 'string' ? parseInt(labelId, 10) : Number(labelId);
                // Check for synthetic tutor filter IDs
                const syntheticLabelMap = {
                  '-1001': { id: -1001, name: 'Tutor - LA' },
                  '-1002': { id: -1002, name: 'Tutor - NYC' },
                  '-1003': { id: -1003, name: 'Tutor - SF' },
                };
                const idStr = String(labelId);
                let label = syntheticLabelMap[idStr];
                if (!label) {
                  label = allLabels.find(l => {
                    const lid = typeof l.id === 'string' ? parseInt(l.id, 10) : Number(l.id);
                    return lid === idNum;
                  });
                }
                if (!label) return null;
                return (
                  <div
                    key={label.id}
                    className="inline-flex items-center gap-1 px-2 py-1.5 sm:py-1 rounded-md text-xs bg-green-600 text-white border border-green-600 group touch-manipulation min-h-[44px] sm:min-h-0"
                  >
                    <span className="max-w-[150px] truncate">{label.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTutorLabel(label.id);
                      }}
                      className="ml-0.5 hover:bg-white/20 active:bg-white/30 rounded p-0.5 transition-colors flex items-center justify-center touch-manipulation"
                      title="Remove filter"
                    >
                      <XMarkIcon className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Right Side: Date Range (Centered on mobile, right-aligned on desktop) */}
        <div className="flex items-center justify-center sm:justify-end">
          <DateRangePicker
            value={dateRangeValue}
            onChange={(startDate, endDate, preset) => {
              setDateRangeValue({ startDate, endDate, preset });
            }}
            label="Date Range"
          />
        </div>
      </div>

      <Section title="Key Performance Indicators">
        {loading ? (
          <div className="text-sm text-neutral-500">Loading…</div>
        ) : totals ? (
          <div className="space-y-6">
            {/* Top Row - Number Metrics (Drivers) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className={isFutureRange ? "opacity-60 pointer-events-none" : ""}>
                <KPICard label="Total Lessons" value={Number(totals.totalLessons ?? 0).toLocaleString()} onClick={() => openDrilldown("Total Lessons - Raw Data", 'lessons')} />
              </div>
              <div className={isFutureRange ? "opacity-60 pointer-events-none" : ""}>
                <KPICard label="Total Hours" value={Number(totals.totalHours ?? 0).toLocaleString()} onClick={() => openDrilldown("Total Hours - Raw Data", 'hours')} />
              </div>
              <div className={isFutureRange ? "opacity-60 pointer-events-none" : ""}>
                <KPICard label="Total Students" value={Number(totals.totalStudents ?? 0).toLocaleString()} onClick={() => openDrilldown("Total Students - Raw Data", 'students')} />
              </div>
              <div className={isFutureRange ? "opacity-60 pointer-events-none" : ""}>
                <KPICard label="Active Tutors" value={Number(totals.totalActiveTutors ?? 0).toLocaleString()} onClick={() => openDrilldown("Active Tutors - Raw Data", 'activetutors')} />
              </div>
            </div>
            
            {/* Bottom Row - Dollar Metrics (Results) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className={isFutureRange ? "opacity-60 pointer-events-none" : ""}>
                <KPICard label="Total Revenue" value={`$${Number(totals.totalRevenue ?? 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} onClick={() => openDrilldown("Total Revenue - Raw Data", 'revenue')} />
              </div>
              <div className={isFutureRange ? "opacity-60 pointer-events-none" : ""}>
                <KPICard label="Total Tutor Pay" value={`$${Number(totals.totalTutorPay ?? 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} subtitle={`Cost ${Number(totals.tutorPayCostPct ?? 0).toFixed(1)}%`} onClick={() => openDrilldown("Total Tutor Pay - Raw Data", 'tutorpayexpected')} />
              </div>
              <div className={isFutureRange ? "opacity-60 pointer-events-none" : ""}>
                <KPICard label="Total Tutor Adhoc Pay" value={`$${Number(totals.totalAdhocPay ?? 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} subtitle={`Cost ${Number(totals.adhocPayCostPct ?? 0).toFixed(1)}%`} onClick={() => openDrilldown("Total Tutor Adhoc Pay - Raw Data", 'tutoradhocpay')} />
              </div>
              <div className={isFutureRange ? "opacity-60 pointer-events-none" : ""}>
                <KPICard label="Total Profit" value={`$${Number((totals.totalRevenue ?? 0) - (totals.totalTutorPay ?? 0) - (totals.totalAdhocPay ?? 0)).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} subtitle={`Profit Margin ${Number(totals.profitMarginPct ?? 0).toFixed(1)}%`} onClick={() => openDrilldown("Total Profit - Raw Data", 'revenue')} />
              </div>
            </div>
          </div>
        ) : (
          kpiCards
        )}
      </Section>

      {/* Trends Section */}
      <Section 
        title="Trends"
        actions={<div className="text-xs text-neutral-500">{timeView === 'Weekly' ? 'Last 12 weeks' : timeView === 'Monthly' ? 'Last 12 months' : 'All years'}</div>}
      >
        {trends.loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
            <span className="ml-2 text-sm text-neutral-600">Loading trends…</span>
          </div>
        ) : trends.error ? (
          <div className="text-sm text-red-600">{trends.error}</div>
        ) : trends.series.length ? (
          <TrendsChart data={trendsWithProjections} view={timeView.toLowerCase()} height={280} />
        ) : (
          <div className="text-sm text-neutral-500">No trend data available</div>
        )}
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <Section 
            title="Tutor Consistency Bonus" 
            actions={
              <div className="flex items-center space-x-2">
                <span className="text-xs text-neutral-500">{timeView}</span>
                {activeTab === 'All' && (
                  <span className="text-xs text-neutral-400">(Teaching hours only)</span>
                )}
              </div>
            }
          >
            {activeTab === 'All' ? (
              <div>
                {tutorBucketsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
                    <span className="ml-2 text-sm text-neutral-600">Loading tutor data...</span>
                  </div>
                ) : tutorBucketsData?.buckets ? (
                  <ClickableBarChart 
                    data={tutorBucketsData.buckets}
                    onBarClick={handleTutorBucketClick}
                    height={200}
                    formatters={{
                      y: (value) => `${value} tutors`
                    }}
                  />
                ) : (
                  <div className="text-sm text-neutral-500">No tutor data available</div>
                )}
                {tutorBucketsData?.totalTutors && (
                  <div className="mt-3 text-xs text-neutral-500">
                    Total active tutors: {tutorBucketsData.totalTutors}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-neutral-500">
                Enhanced tutor hour buckets are available in "All" tab only.
              </div>
            )}
          </Section>
        </div>
        <div className="lg:col-span-2 space-y-6">
          {showClientTracker && (
            <Section title="Client Tracker">
              <div className="grid grid-cols-3 gap-4">
                <KPICard label="Leads" value={(serverData?.clientTracker?.leads ?? 0).toLocaleString()} onClick={() => openDrilldown("Leads - Raw Data", 'leads')} />
                <KPICard label="Trials" value={(serverData?.clientTracker?.trials ?? 0).toLocaleString()} onClick={() => openDrilldown("Trials - Raw Data", 'trialFirstLessons')} />
                <KPICard label="Conversions" value={(serverData?.clientTracker?.conversions ?? 0).toLocaleString()} onClick={() => openDrilldown("Conversions - Raw Data", 'convertedLeads')} />
              </div>
            </Section>
          )}
        </div>
      </div>

      {activeTab === "Clubs" && (
        <Section title="Clubs Overview">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <KPICard label="Total Classes" value={(serverData?.clubs?.classes ?? 0).toLocaleString()} onClick={() => openDrilldown("Classes - Raw Data", 'classes')} />
            <KPICard label="Total Camps" value={(serverData?.clubs?.camps ?? 0).toLocaleString()} onClick={() => openDrilldown("Camps - Raw Data", 'camps')} />
          </div>
        </Section>
      )}

      {/* Credit & Balance Adjustments */}
      <CreditAdjustmentsSummary />

      {/* Drilldown Modal */}
      <DataModal open={modalOpen} onClose={() => setModalOpen(false)} title={modalTitle} rows={detailRows} />
      
      {/* Tutor Hour Buckets Drilldown Modal */}
      <TutorDrilldownModal 
        open={tutorDrilldownOpen} 
        onClose={() => setTutorDrilldownOpen(false)} 
        bucketData={selectedBucketData}
        timeView={timeView}
        dateRange={{ start: rangeStartDate, end: rangeEndDate }}
        onRefresh={fetchTutorBuckets}
      />
      
      {/* Label Configuration Modal */}
      <LabelConfigurationModal
        open={labelConfigOpen}
        onClose={() => setLabelConfigOpen(false)}
        onSave={handleLabelPreferencesSave}
        currentLabels={allLabels}
        userPreferences={labelPreferences}
      />
      
      {/* Job Label Selector Modal */}
      <JobLabelSelectorModal
        open={jobLabelSelectorOpen}
        onClose={() => setJobLabelSelectorOpen(false)}
        onSave={handleJobLabelsSave}
        selectedLabelIds={selectedJobLabelIds}
        allLabels={allLabels}
      />
      
          {/* Tutor Label Selector Modal */}
          <TutorLabelSelectorModal
            open={tutorLabelSelectorOpen}
            onClose={() => setTutorLabelSelectorOpen(false)}
            onSave={handleTutorLabelsSave}
            selectedLabelIds={selectedTutorLabelIds}
            allLabels={allLabels}
          />
        </>
      )}
    </div>
  );
}


