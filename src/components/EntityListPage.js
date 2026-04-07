import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  XMarkIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { ChartBarIcon } from '@heroicons/react/20/solid';
import FilterModal from './FilterModal';
import AutocompleteSearch from './AutocompleteSearch';
import { RoleProvider, useRole } from '../contexts/RoleContext';
import { BranchProvider, useBranch } from '../contexts/BranchContext';
import axios from 'axios';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  IconButton,
  CircularProgress,
} from '@mui/material';

// Shared component for entity list pages
export default function EntityListPage({
  title,
  entityType,
  apiEndpoint,
  getRowData,
  columns,
  searchPlaceholder = "Search...",
  filters = [],
  tabs = [],
  defaultTab,
  getEntityLink,
  getEntityName,
  getEntitySubtitle,
  onTabCountsUpdate,
  customHeaderAction,
  metricsConfig, // Optional: array of metric configs for dashboard cards
  externalFilters = {}, // Optional: filters from parent component
  hideTitle = false, // Optional: hide the title (when parent renders it)
  hideActions = false, // Optional: hide the actions column (when name is clickable)
  resizableColumns = true // All tables MUST have resizable columns per STC design system
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [user, setUser] = useState(null);

  // Resizable columns state - load from localStorage
  const storageKey = `columnWidths_${entityType}`;
  const [columnWidths, setColumnWidths] = useState(() => {
    if (!resizableColumns) return {};
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [resizing, setResizing] = useState(null);

  // Save column widths to localStorage when changed
  useEffect(() => {
    if (resizableColumns && Object.keys(columnWidths).length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(columnWidths));
    }
  }, [columnWidths, storageKey, resizableColumns]);

  // Handle column resize
  const handleResizeStart = (e, colKey) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const th = e.target.closest('th');
    const startWidth = th.offsetWidth;

    setResizing({ colKey, startX, startWidth });
  };

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e) => {
      const diff = e.clientX - resizing.startX;
      const newWidth = Math.max(80, resizing.startWidth + diff); // Min width 80px
      setColumnWidths(prev => ({
        ...prev,
        [resizing.colKey]: newWidth
      }));
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing]);
  
  // Metrics state
  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState(null);
  const [metricModalOpen, setMetricModalOpen] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [metricDetailData, setMetricDetailData] = useState([]);
  const [metricDetailLoading, setMetricDetailLoading] = useState(false);
  
  // Determine default tab: URL param > prop > first tab > 'all'
  const getDefaultTab = () => {
    if (searchParams.get('tab')) return searchParams.get('tab');
    if (defaultTab) return defaultTab;
    if (tabs.length > 0) return tabs[0].key;
    return 'all';
  };
  const [activeTab, setActiveTab] = useState(getDefaultTab());
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState(() => {
    const filtersObj = {};
    filters.forEach(filter => {
      const value = searchParams.get(filter.key);
      if (value) {
        if (filter.type === 'checkbox-group') {
          filtersObj[filter.key] = value.split(',');
        } else {
          filtersObj[filter.key] = value;
        }
      }
    });
    return filtersObj;
  });

  // Sort state - initialized from URL params or localStorage
  const getSortPreferenceKey = () => `sort_preference_${entityType}`;
  const [sortColumn, setSortColumn] = useState(() => {
    const urlSort = searchParams.get('sort');
    if (urlSort) return urlSort;
    try {
      const saved = localStorage.getItem(getSortPreferenceKey());
      if (saved) {
        const { column } = JSON.parse(saved);
        return column || 'name';
      }
    } catch (e) {}
    return 'name'; // Default sort by name
  });
  const [sortDirection, setSortDirection] = useState(() => {
    const urlDir = searchParams.get('sort_dir');
    if (urlDir) return urlDir;
    try {
      const saved = localStorage.getItem(getSortPreferenceKey());
      if (saved) {
        const { direction } = JSON.parse(saved);
        return direction || 'asc';
      }
    } catch (e) {}
    return 'asc'; // Default ascending
  });

  // Save sort preference to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem(getSortPreferenceKey(), JSON.stringify({
        column: sortColumn,
        direction: sortDirection
      }));
    } catch (e) {
      console.error('Error saving sort preference:', e);
    }
  }, [sortColumn, sortDirection, entityType]);

  // Handle column sort
  const handleSort = (columnKey) => {
    const newDirection = sortColumn === columnKey && sortDirection === 'asc' ? 'desc' : 'asc';
    setSortColumn(columnKey);
    setSortDirection(newDirection);

    // Update URL params
    const newParams = new URLSearchParams(searchParams);
    newParams.set('sort', columnKey);
    newParams.set('sort_dir', newDirection);
    newParams.set('page', '1'); // Reset to first page on sort change
    setSearchParams(newParams);
  };

  // Fetch user data
  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData && userData !== "undefined") {
      try {
        const parsedUserData = JSON.parse(userData);
        if (parsedUserData) {
          setUser(parsedUserData);
        }
      } catch (error) {
        console.error("Error parsing user data:", error);
      }
    }
  }, []);

  // Set default tab in URL on initial load if no tab param exists
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (!tabParam && defaultTab) {
      const newParams = new URLSearchParams(searchParams);
      newParams.set('tab', defaultTab);
      setSearchParams(newParams, { replace: true });
    }
  }, []); // Only run on mount

  useEffect(() => {
    fetchData();
  }, [searchParams, JSON.stringify(externalFilters)]);

  // Fetch metrics if metricsConfig is provided
  useEffect(() => {
    if (!metricsConfig || metricsConfig.length === 0 || !entityType) {
      return;
    }

    const fetchMetrics = async () => {
      setMetricsLoading(true);
      setMetricsError(null);
      try {
        const response = await axios.get(`/api/entity-metrics/${entityType}`, {
          withCredentials: true,
        });
        setMetrics(response.data);
      } catch (error) {
        console.error('Error fetching metrics:', error);
        setMetricsError(error.message || 'Failed to fetch metrics');
      } finally {
        setMetricsLoading(false);
      }
    };

    fetchMetrics();
  }, [metricsConfig, entityType]);

  // Update active tab from URL params
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam) {
      setActiveTab(tabParam);
    } else if (defaultTab) {
      setActiveTab(defaultTab);
    } else if (tabs.length > 0) {
      setActiveTab(tabs[0].key);
    }
  }, [searchParams, tabs, defaultTab]);

  // Live filtering: debounce search input changes to update table results
  useEffect(() => {
    const currentSearchParam = searchParams.get('search') || '';

    // Skip if search hasn't actually changed from URL
    if (search === currentSearchParam) return;

    const timeoutId = setTimeout(() => {
      const newParams = new URLSearchParams(searchParams);
      if (search) {
        newParams.set('search', search);
      } else {
        newParams.delete('search');
      }
      newParams.set('page', '1'); // Reset to first page
      setSearchParams(newParams);
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [search]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(searchParams);

      // Add tab filter if active tab is not 'all'
      if (activeTab && activeTab !== 'all' && tabs.length > 0) {
        const tabConfig = tabs.find(t => t.key === activeTab);
        if (tabConfig && tabConfig.filter) {
          Object.entries(tabConfig.filter).forEach(([key, value]) => {
            params.set(key, value);
          });
        }
      }

      // Add external filters from parent component
      if (externalFilters && Object.keys(externalFilters).length > 0) {
        Object.entries(externalFilters).forEach(([key, value]) => {
          if (value) {
            params.set(key, value);
          }
        });
      }

      // Add sort params if not already in URL
      if (!params.has('sort') && sortColumn) {
        params.set('sort', sortColumn);
      }
      if (!params.has('sort_dir') && sortDirection) {
        params.set('sort_dir', sortDirection);
      }

      const url = `/api/entity-lists/${apiEndpoint}?${params}`;
      console.log('Fetching:', url);
      const response = await fetch(url);
      const responseData = await response.json().catch(() => ({}));
      
      if (!response.ok) {
        console.error('API Error Response:', {
          status: response.status,
          statusText: response.statusText,
          data: responseData
        });
        throw new Error(responseData.error || responseData.details || `Failed to fetch data (${response.status})`);
      }
      
      setData(responseData);
      setError(null);
      
      // Update tab counts if provided in response
      if (responseData.tabCounts && onTabCountsUpdate) {
        onTabCountsUpdate(responseData.tabCounts);
      }
    } catch (err) {
      console.error('Fetch Error:', err);
      console.error('Error message:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    const newParams = new URLSearchParams(searchParams);
    if (search) {
      newParams.set('search', search);
    } else {
      newParams.delete('search');
    }
    newParams.set('page', '1'); // Reset to first page on new search
    setSearchParams(newParams);
  };

  const handleFilterChange = (filterKey, value) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(filterKey, value);
    } else {
      newParams.delete(filterKey);
    }
    newParams.set('page', '1'); // Reset to first page on filter change
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

  const handleTabChange = (tabKey) => {
    const newParams = new URLSearchParams(searchParams);
    if (tabKey && tabKey !== 'all') {
      newParams.set('tab', tabKey);
    } else {
      newParams.delete('tab');
    }
    newParams.set('page', '1'); // Reset to first page on tab change
    setSearchParams(newParams);
    setActiveTab(tabKey);
  };

  const handleApplyFilters = (appliedFilters) => {
    const newParams = new URLSearchParams(searchParams);

    // Clear existing filter params using the filter config keys
    Object.keys(appliedFilters).forEach(key => {
      newParams.delete(key);
    });

    // Set new filter params
    Object.entries(appliedFilters).forEach(([key, value]) => {
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
    setActiveFilters(appliedFilters);
  };

  const clearFilters = () => {
    const newParams = new URLSearchParams();
    // Keep tab if it exists
    if (activeTab && activeTab !== 'all') {
      newParams.set('tab', activeTab);
    }
    setSearchParams(newParams);
    setSearch('');
    setActiveFilters({});
  };

  const handlePageChange = (newPage) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', newPage.toString());
    setSearchParams(newParams);
  };

  // Handle different API response key formats
  const getEntities = () => {
    if (!data) return [];
    // Standard format: { data: [...], pagination: {...}, tabCounts: {...} }
    if (data.data && Array.isArray(data.data)) return data.data;
    // Try common variations
    if (data[entityType]) return data[entityType];
    if (data[`${entityType}s`]) return data[`${entityType}s`];
    // For lessons, it might be 'lessons' not 'lesson'
    if (entityType === 'lessons' && data.lessons) return data.lessons;
    return [];
  };
  
  const entities = getEntities();
  const pagination = data?.pagination;

  // Handle metric card click - open modal with details
  const handleMetricClick = async (metricKey) => {
    setSelectedMetric(metricKey);
    setMetricModalOpen(true);
    setMetricDetailLoading(true);
    setMetricDetailData([]);

    try {
      const params = new URLSearchParams();
      const config = metricsConfig.find(m => m.key === metricKey);

      // Apply filters based on metric type
      if (config?.filter) {
        Object.entries(config.filter).forEach(([key, value]) => {
          params.append(key, value);
        });
      }

      const response = await axios.get(`/api/entity-lists/${apiEndpoint}?${params.toString()}`, {
        withCredentials: true,
      });
      
      const entities = response.data[entityType] || response.data.data || response.data || [];
      setMetricDetailData(entities);
    } catch (error) {
      console.error('Error fetching metric details:', error);
    } finally {
      setMetricDetailLoading(false);
    }
  };

  // Handle filter icon click - filter the list
  const handleFilterClick = (metricKey) => {
    const config = metricsConfig.find(m => m.key === metricKey);
    if (config?.filter) {
      const newParams = new URLSearchParams(searchParams);
      Object.entries(config.filter).forEach(([key, value]) => {
        newParams.set(key, value);
      });
      setSearchParams(newParams, { replace: true });
      
      const matchingTab = tabs.find(t => {
        return Object.entries(config.filter).every(([k, v]) => t.filter?.[k] === v);
      });
      if (matchingTab) {
        setActiveTab(matchingTab.key);
      }
    }
  };

  // Get metric value
  const getMetricValue = (key) => {
    if (!metrics) return 0;
    return metrics[key] || 0;
  };

  // Render metrics cards
  const renderMetricsCards = () => {
    if (!metricsConfig || metricsConfig.length === 0) return null;

    if (metricsLoading) {
      return (
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 mb-4 sm:mb-6">
          <div className="flex justify-center items-center min-h-[200px]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple"></div>
          </div>
        </div>
      );
    }

    if (metricsError) {
      return (
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 mb-4 sm:mb-6">
          <div className="text-sm text-red-600">Error loading metrics: {metricsError}</div>
        </div>
      );
    }

    const getBorderColor = (tone) => {
      switch (tone) {
        case 'success': return 'border-green-500';
        case 'warning': return 'border-orange-500';
        case 'danger': return 'border-red-500';
        default: return 'border-blue-500';
      }
    };

    return (
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 mb-4 sm:mb-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
        <div className="p-4 sm:p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-neutral-900">Key Metrics</h2>
            <Link
              to={`/${entityType}/analytics`}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-brand-purple hover:text-brand-navy hover:bg-brand-purple/10 rounded-md transition-colors"
            >
              <ChartBarIcon className="h-4 w-4" />
              View Full Analytics
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {metricsConfig.map((config) => (
              <div
                key={config.key}
                className={`bg-white rounded-xl shadow-sm border-l-4 ${getBorderColor(config.tone || 'default')} border border-neutral-200 p-4 sm:p-5 cursor-pointer hover:shadow-md transition-all duration-200`}
                onClick={() => handleMetricClick(config.key)}
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-xs text-neutral-600 font-medium">{config.title}</h3>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFilterClick(config.key);
                    }}
                    className="text-neutral-400 hover:text-brand-purple transition-colors p-1"
                  >
                    <FunnelIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-neutral-900 mb-1">
                  {getMetricValue(config.key).toLocaleString()}
                </div>
                {config.subtitle && (
                  <p className="text-xs text-neutral-600 mb-1">{config.subtitle}</p>
                )}
                {config.helperText && (
                  <p className="text-xs text-neutral-500 opacity-80 leading-relaxed">{config.helperText}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <RoleProvider user={user}>
      <BranchProvider user={user}>
        <>
          <div className={hideTitle ? "" : "max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8"}>
            {/* Page Header - Mobile Responsive */}
            {!hideTitle && (
              <div className="bg-white border-b border-neutral-200 shadow-sm mb-4 sm:mb-6 rounded-xl">
                <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-neutral-900 leading-tight">{title}</h1>
                    {customHeaderAction && (
                      <div className="flex-shrink-0">{customHeaderAction}</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Metrics Cards */}
            {renderMetricsCards()}

        {/* Tabs - Mobile Responsive */}
        {tabs.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 mb-4 sm:mb-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
            <div className="border-b border-neutral-200">
              <nav className="flex space-x-4 sm:space-x-0 overflow-x-auto scrollbar-hide -mx-4 sm:mx-0 px-4 sm:px-0 -mb-px" aria-label="Tabs">
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => handleTabChange(tab.key)}
                      className={`
                        px-4 sm:px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                        min-h-[44px] sm:min-h-0
                        ${isActive
                          ? 'border-brand-purple text-brand-purple'
                          : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                        }
                      `}
                    >
                      {tab.label}
                      {tab.count !== undefined && (
                        <span className={`ml-2 ${isActive ? 'text-brand-purple' : 'text-neutral-500'}`}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        )}

        {/* Search and Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 mb-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
          <div className="flex items-center justify-between mb-4">
            <form onSubmit={handleSearch} className="flex-1 mr-4">
              <AutocompleteSearch
                value={search}
                onChange={setSearch}
                onSearch={handleSearch}
                placeholder={searchPlaceholder}
                getSuggestions={async (query) => {
                  // Fetch suggestions from the API
                  const params = new URLSearchParams();
                  params.set('search', query);
                  params.set('limit', '10'); // Limit to 10 suggestions
                  
                  // Add current tab filter if active
                  if (activeTab && activeTab !== 'all' && tabs.length > 0) {
                    const tabConfig = tabs.find(t => t.key === activeTab);
                    if (tabConfig && tabConfig.filter) {
                      Object.entries(tabConfig.filter).forEach(([key, value]) => {
                        params.set(key, value);
                      });
                    }
                  }
                  
                  try {
                    const response = await fetch(`/api/entity-lists/${apiEndpoint}?${params.toString()}`);
                    if (!response.ok) throw new Error('Failed to fetch suggestions');
                    const data = await response.json();
                    return data[entityType] || [];
                  } catch (error) {
                    console.error('Error fetching suggestions:', error);
                    return [];
                  }
                }}
                getEntityLink={getEntityLink || undefined}
                getEntityName={getEntityName || undefined}
                getEntitySubtitle={getEntitySubtitle || undefined}
                minChars={2}
              />
            </form>
            <div className="flex gap-2">
              {filters.length > 0 && (
                <button
                  onClick={() => setIsFilterModalOpen(true)}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 border border-neutral-300 rounded-md hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-brand-purple transition-colors text-sm font-medium min-h-[44px] sm:min-h-0"
                >
                      <FunnelIcon className="h-5 w-5 text-brand-purple flex-shrink-0" />
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
                  if (Array.isArray(value)) {
                    displayValue = value.join(', ');
                  } else if (filter.type === 'select') {
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
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
                <p className="mt-4 text-sm text-neutral-600 leading-relaxed">Loading...</p>
          </div>
        ) : error ? (
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
                <p className="text-sm text-red-600 leading-relaxed">Error: {error}</p>
          </div>
        ) : (
          <>
                <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
              <div className="overflow-x-auto">
                <table className={`w-full divide-y divide-neutral-200 ${resizableColumns ? 'table-fixed' : ''}`}>
                  <thead className="bg-neutral-50">
                    <tr>
                      {columns.map((col) => {
                        // Determine column width classes based on column type
                        const getColumnWidthClass = (key) => {
                          // Use min-widths to ensure readability while allowing flexibility
                          if (key === 'name') return 'min-w-[180px]';
                          if (key === 'email') return 'min-w-[200px]';
                          if (key === 'phone') return 'min-w-[130px]';
                          if (key === 'status') return 'min-w-[100px]';
                          if (key === 'rate' || key === 'balance' || key === 'defaultRate') return 'min-w-[110px]';
                          if (key === 'labels') return 'min-w-[200px] max-w-[350px]';
                          if (key === 'pipeline') return 'min-w-[140px]';
                          return '';
                        };

                        const shouldWrap = col.wrap !== false && (
                          col.key === 'labels' ||
                          col.key === 'description' ||
                          col.wrap === true
                        );

                        // Check if this column is sortable (default: true unless col.sortable === false)
                        const isSortable = col.sortable !== false;
                        const isCurrentSort = sortColumn === col.key;

                        // Get column width (from state or default)
                        const colWidth = resizableColumns && columnWidths[col.key]
                          ? `${columnWidths[col.key]}px`
                          : (col.width || undefined);

                        return (
                          <th
                            key={col.key}
                            className={`px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider ${getColumnWidthClass(col.key)} ${shouldWrap ? '' : 'whitespace-nowrap'} ${isSortable ? 'cursor-pointer hover:bg-neutral-100 select-none transition-colors' : ''} ${resizableColumns ? 'relative' : ''}`}
                            style={colWidth ? { width: colWidth, minWidth: resizableColumns ? '80px' : undefined } : undefined}
                            onClick={isSortable ? () => handleSort(col.key) : undefined}
                          >
                            <div className="flex items-center gap-1">
                              {col.label}
                              {isSortable && (
                                <span className="flex flex-col">
                                  {isCurrentSort ? (
                                    sortDirection === 'asc' ? (
                                      <ChevronUpIcon className="h-4 w-4 text-brand-purple" />
                                    ) : (
                                      <ChevronDownIcon className="h-4 w-4 text-brand-purple" />
                                    )
                                  ) : (
                                    <span className="h-4 w-4 text-neutral-300 flex flex-col items-center justify-center">
                                      <ChevronUpIcon className="h-2.5 w-2.5 -mb-0.5" />
                                      <ChevronDownIcon className="h-2.5 w-2.5 -mt-0.5" />
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                            {/* Resize handle - wider grab area for easier interaction */}
                            {resizableColumns && (
                              <div
                                className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize hover:bg-brand-purple/20 group z-10"
                                onMouseDown={(e) => handleResizeStart(e, col.key)}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-neutral-300 group-hover:bg-brand-purple transition-colors rounded-full" />
                              </div>
                            )}
                          </th>
                        );
                      })}
                      {getEntityLink && !hideActions && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider min-w-[80px] whitespace-nowrap">
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {entities.length === 0 ? (
                      <tr>
                            <td colSpan={columns.length + (getEntityLink && !hideActions ? 1 : 0)} className="px-6 py-12 text-center text-sm text-neutral-500 leading-relaxed">
                          No {entityType.replace(/s$/, '')}s found
                        </td>
                      </tr>
                    ) : (
                      entities.map((entity, index) => {
                        const rowData = getRowData(entity);
                        // Get the ID field based on entity type
                        const entityId = entity.contractor_id || entity.client_id || entity.recipient_id || entity.service_id || entity.appointment_id || entity.id;
                        // Ensure unique key by combining ID with index as fallback
                        const uniqueKey = entityId ? `${entityId}-${index}` : `entity-${index}`;
                        return (
                              <tr key={uniqueKey} className="hover:bg-neutral-50 transition-colors">
                            {columns.map((col) => {
                              // Get column width for body cells (from state or default)
                              const bodyCellWidth = resizableColumns && columnWidths[col.key]
                                ? `${columnWidths[col.key]}px`
                                : (col.width || undefined);

                              // Check if column has a custom render function
                              if (col.render) {
                                const shouldWrap = col.wrap !== false; // Default to wrapping unless explicitly disabled
                                return (
                                  <td
                                    key={col.key}
                                    className={`px-6 py-4 text-sm text-neutral-900 ${shouldWrap ? '' : 'whitespace-nowrap'}`}
                                    style={bodyCellWidth ? { width: bodyCellWidth } : undefined}
                                  >
                                    {col.render(rowData, entity)}
                                  </td>
                                );
                              }
                              
                              // Make certain columns clickable if getEntityLink is provided
                              // For lessons, make the 'service' column clickable; for other entities, make name columns clickable
                              const isClickableColumn = col.key === 'name' || 
                                                       col.key === 'studentName' || 
                                                       col.key === 'jobName' ||
                                                       col.key === 'service';
                              const cellContent = rowData[col.key];
                              
                              // Determine if column should wrap text
                              // Labels and other long text columns should wrap
                              const shouldWrap = col.wrap !== false && (
                                col.key === 'labels' || 
                                col.key === 'description' ||
                                col.wrap === true
                              );
                              
                              // Get column width class to match header
                              const getColumnWidthClass = (key) => {
                                if (key === 'name') return 'min-w-[180px]';
                                if (key === 'email') return 'min-w-[200px]';
                                if (key === 'phone') return 'min-w-[130px]';
                                if (key === 'status') return 'min-w-[100px]';
                                if (key === 'rate' || key === 'balance' || key === 'defaultRate') return 'min-w-[110px]';
                                if (key === 'labels') return 'min-w-[200px] max-w-[350px]';
                                if (key === 'pipeline') return 'min-w-[140px]';
                                return '';
                              };
                              
                              return (
                                <td
                                  key={col.key}
                                  className={`px-6 py-4 text-sm text-neutral-900 ${getColumnWidthClass(col.key)} ${shouldWrap ? '' : 'whitespace-nowrap'} ${isClickableColumn && getEntityLink ? 'cursor-pointer' : ''}`}
                                  style={bodyCellWidth ? { width: bodyCellWidth } : undefined}
                                  onClick={isClickableColumn && getEntityLink ? () => navigate(getEntityLink(entity)) : undefined}
                                >
                                  {isClickableColumn && getEntityLink ? (
                                    <Link
                                      to={getEntityLink(entity)}
                                      className="text-brand-purple hover:text-brand-navy font-medium hover:underline transition-colors"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {cellContent}
                                    </Link>
                                  ) : (
                                    <span className={shouldWrap ? 'break-words line-clamp-2' : ''} title={shouldWrap && cellContent ? cellContent : undefined}>{cellContent}</span>
                                  )}
                                </td>
                              );
                            })}
                            {getEntityLink && !hideActions && (
                              <td className="px-6 py-4 whitespace-nowrap text-sm min-w-[80px]">
                                <Link
                                  to={getEntityLink(entity)}
                                      className="text-brand-purple hover:text-brand-navy font-medium transition-colors"
                                >
                                  View
                                </Link>
                              </td>
                            )}
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
                    <div className="text-sm text-neutral-700 leading-relaxed">
                  Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                  {pagination.total} results
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1}
                        className="px-4 py-2.5 sm:py-2 border border-neutral-300 rounded-md text-sm font-medium text-neutral-700 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px] sm:min-h-0"
                  >
                    Previous
                  </button>
                      <span className="px-4 py-2 text-sm text-neutral-700 leading-relaxed">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                        className="px-4 py-2.5 sm:py-2 border border-neutral-300 rounded-md text-sm font-medium text-neutral-700 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px] sm:min-h-0"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
          </div>

          {/* Metric Detail Modal */}
          {metricsConfig && metricsConfig.length > 0 && (
            <Dialog
              open={metricModalOpen}
              onClose={() => setMetricModalOpen(false)}
              maxWidth="md"
              fullWidth
            >
              <DialogTitle>
                {selectedMetric && metricsConfig.find(m => m.key === selectedMetric)?.title}
                <IconButton
                  onClick={() => setMetricModalOpen(false)}
                  sx={{ position: 'absolute', right: 8, top: 8 }}
                >
                  <XMarkIcon className="h-5 w-5" />
                </IconButton>
              </DialogTitle>
              <DialogContent>
                {metricDetailLoading ? (
                  <div className="flex justify-center p-6">
                    <CircularProgress />
                  </div>
                ) : metricDetailData.length === 0 ? (
                  <Typography>No data available</Typography>
                ) : (
                  <TableContainer component={Paper}>
                    <Table>
                      <TableHead>
                        <TableRow>
                          {columns.map((col) => (
                            <TableCell key={col.key}>{col.label}</TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {metricDetailData.slice(0, 50).map((entity, idx) => {
                          const rowData = getRowData(entity);
                          return (
                            <TableRow key={idx}>
                              {columns.map((col) => (
                                <TableCell key={col.key}>
                                  {rowData[col.key]}
                                </TableCell>
                              ))}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setMetricModalOpen(false)}>Close</Button>
              </DialogActions>
            </Dialog>
          )}
        </>
      </BranchProvider>
    </RoleProvider>
  );
}
