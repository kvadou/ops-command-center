import React, { useState, useRef, useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  TextField,
  InputAdornment,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText as MuiListItemText,
  Divider,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
} from '@mui/material';

import {
  MagnifyingGlassIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  TrashIcon,
  Cog6ToothIcon,
  FunnelIcon,
  ListBulletIcon,
  EllipsisVerticalIcon,
  ViewColumnsIcon,
  ClipboardDocumentIcon,
  PencilSquareIcon,
  BeakerIcon,
  StopIcon,
} from '@heroicons/react/24/outline';
import { CheckIcon } from '@heroicons/react/24/solid';

import { DataGrid, useGridApiContext, useGridSelector, gridPageCountSelector, gridPaginationModelSelector, gridRowCountSelector } from '@mui/x-data-grid';
import { DateTime } from 'luxon';
import DateRangePicker from './DateRangePicker';
import { useColumnConfig } from '../hooks/useColumnConfig';
import { TablePagination } from '@mui/material';

// Custom toolbar component with pagination at top
function CustomToolbarWithPagination() {
  const apiRef = useGridApiContext();
  const paginationModel = useGridSelector(apiRef, gridPaginationModelSelector);
  const rowCount = useGridSelector(apiRef, gridRowCountSelector);

  const handlePageChange = (event, newPage) => {
    apiRef.current.setPage(newPage);
  };

  const handlePageSizeChange = (event) => {
    const newPageSize = parseInt(event.target.value, 10);
    apiRef.current.setPageSize(newPageSize);
  }

  return (
    <Box sx={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'flex-end',
      px: 2,
      py: 1,
      borderBottom: '1px solid #e4e6eb',
      bgcolor: 'white'
    }}>
      <TablePagination
        component="div"
        count={rowCount}
        page={paginationModel.page}
        onPageChange={handlePageChange}
        rowsPerPage={paginationModel.pageSize}
        onRowsPerPageChange={handlePageSizeChange}
        rowsPerPageOptions={[10, 25, 50, 100]}
        labelRowsPerPage="Rows per page:"
        sx={{
          '& .MuiTablePagination-toolbar': {
            paddingLeft: 0,
            paddingRight: 0,
          },
          '& .MuiTablePagination-displayedRows': {
            margin: 0,
          },
        }}
      />
    </Box>
  );
}

/**
 * Standard DataGrid Layout Component - Facebook Ads Manager Style
 * 
 * This component provides a standardized layout for pages with DataGrid tables,
 * including search, date range picker, tabs, action buttons, and column configuration.
 * 
 * @param {Object} props
 * @param {string} props.title - Page title
 * @param {Array} props.columns - Column definitions for DataGrid
 * @param {Array} props.rows - Data rows for DataGrid
 * @param {Array} props.tabs - Tab configuration [{label, value}]
 * @param {string} props.activeTab - Currently active tab value
 * @param {Function} props.onTabChange - Tab change handler
 * @param {string} props.searchQuery - Search query value
 * @param {Function} props.onSearchChange - Search change handler
 * @param {Object} props.dateRange - Date range {startDate, endDate}
 * @param {Function} props.onDateRangeChange - Date range change handler
 * @param {Array} props.actionButtons - Action button configurations
 * @param {Function} props.getRowId - Function to get row ID
 * @param {Object} props.dataGridProps - Additional props for DataGrid
 * @param {string} props.pagePath - Unique path for column config persistence
 * @param {Array} props.moreMenuItems - Items for the "More" menu
 */
export default function StandardDataGridLayout({
  title = "Data Grid",
  columns: defaultColumns = [],
  rows = [],
  tabs = [],
  activeTab = null,
  onTabChange = () => {},
  searchQuery = "",
  onSearchChange = () => {},
  dateRange = null,
  onDateRangeChange = null,
  actionButtons = [],
  getRowId = (row) => row.id,
  dataGridProps = {},
  pagePath = window.location.pathname,
  moreMenuItems = [],
  toolbarActions = null, // Custom toolbar actions
  searchPlaceholder = "Search to filter by: name, ID or metrics",
}) {
  const [columnMenuAnchor, setColumnMenuAnchor] = useState(null);
  const [selectedColumnField, setSelectedColumnField] = useState(null);
  const [columnsMenuAnchor, setColumnsMenuAnchor] = useState(null);
  const [moreMenuAnchor, setMoreMenuAnchor] = useState(null);
  const [columnConfigMenuAnchor, setColumnConfigMenuAnchor] = useState(null);
  const [columnSearchQuery, setColumnSearchQuery] = useState("");

  // Initialize date range only if onDateRangeChange is provided
  const [localDateRange, setLocalDateRange] = useState(() => {
    if (dateRange) return dateRange;
    if (!onDateRangeChange) return null;
    const end = DateTime.now().setZone("America/New_York");
    const start = end.minus({ days: 30 });
    return {
      startDate: start.toISODate(),
      endDate: end.toISODate(),
    };
  });

  // Update localDateRange when dateRange prop changes
  useEffect(() => {
    if (dateRange) {
      setLocalDateRange(dateRange);
    }
  }, [dateRange]);

  // Use column configuration hook
  const {
    visibleColumns,
    filteredColumns,
    columnWidths,
    toggleColumn,
    toggleAllColumns,
    resetColumns,
    moveColumn,
    handleColumnWidthChange,
    allColumnsVisible,
  } = useColumnConfig(pagePath, defaultColumns);

  // Initialize column width model from persisted widths, with defaults for all columns
  const [columnWidthModel, setColumnWidthModel] = useState(() => {
    const model = { ...(columnWidths || {}) };
    // Ensure all columns have a width in the model (use persisted or default)
    // For flex columns, only set a width if it's been persisted (user resized it)
    defaultColumns.forEach(col => {
      if (model[col.field] === undefined) {
        // Only set default width for non-flex columns
        // Flex columns will use flex until user resizes them
        if (!col.flex) {
          model[col.field] = col.width || col.minWidth || 150;
        }
      }
    });
    return model;
  });

  // Update column width model when columnWidths change from hook
  useEffect(() => {
    if (columnWidths && Object.keys(columnWidths).length > 0) {
      setColumnWidthModel(prev => {
        const updated = { ...prev };
        // Merge persisted widths (including flex columns that were resized)
        Object.keys(columnWidths).forEach(field => {
          updated[field] = columnWidths[field];
        });
        // Only set default width for non-flex columns that don't have a width yet
        defaultColumns.forEach(col => {
          if (updated[col.field] === undefined && !col.flex) {
            updated[col.field] = col.width || col.minWidth || 150;
          }
        });
        return updated;
      });
    }
  }, [columnWidths, defaultColumns]);

  // Format date range for display
  const formatDateRange = () => {
    if (!localDateRange?.startDate || !localDateRange?.endDate) return "Last 30 days";
    const start = DateTime.fromISO(localDateRange.startDate);
    const end = DateTime.fromISO(localDateRange.endDate);
    return `${start.toFormat("MMM d")} – ${end.toFormat("MMM d, yyyy")}`;
  };

  // Get preset label for helper text
  const getPresetLabel = (preset) => {
    if (!preset) return '';
    const presetLabels = {
      'today': 'Today',
      'yesterday': 'Yesterday',
      'todayYesterday': 'Today & Yesterday',
      'last7days': 'Last 7 days',
      'last14days': 'Last 14 days',
      'last28days': 'Last 28 days',
      'last30days': 'Last 30 days',
      'thisWeek': 'This week',
      'lastWeek': 'Last week',
      'thisMonth': 'This month',
      'lastMonth': 'Last month',
      'last3Months': 'Last 3 months',
      'last6Months': 'Last 6 months',
      'thisYear': 'This year',
      'lastYear': 'Last year',
      'lifetime': 'Lifetime',
      'custom': 'Custom range'
    };
    return presetLabels[preset] || '';
  };

  // Custom column header — STC Design System: uppercase tracking-wider
  const renderColumnHeader = (params) => {
    const handleMenuOpen = (event, field) => {
      event.stopPropagation();
      setColumnMenuAnchor(event.currentTarget);
      setSelectedColumnField(field);
    };

    return (
      <div className="flex items-center justify-between w-full h-full px-2 group">
        <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap select-none flex-1">
          {params.colDef.headerName}
        </span>
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-neutral-100"
          onClick={(e) => handleMenuOpen(e, params.field)}
        >
          <EllipsisVerticalIcon className="h-4 w-4 text-neutral-400" />
        </button>
      </div>
    );
  };

  // Add renderHeader to visible columns
  const columnsWithHeaders = filteredColumns.map(col => ({
    ...col,
    renderHeader: col.renderHeader || renderColumnHeader,
  }));

  // Filter columns for column config menu
  const filteredColumnOptions = defaultColumns.filter(col =>
    col.headerName?.toLowerCase().includes(columnSearchQuery.toLowerCase()) ||
    col.field?.toLowerCase().includes(columnSearchQuery.toLowerCase())
  );

  return (
    <Box sx={{
      p: 0,
      bgcolor: 'transparent',
    }}>
      {/* Sub-tabs — STC Design System standard */}
      {tabs.length > 0 && (
        <div className="border-b border-neutral-200 px-4 sm:px-6">
          <nav className="flex gap-6 -mb-px items-center">
            {tabs.map(tab => {
              const isActive = (activeTab !== null && activeTab !== undefined)
                ? activeTab === tab.value
                : tab === tabs[0];
              return (
                <button
                  key={tab.value}
                  onClick={(e) => onTabChange(e, tab.value)}
                  className={`px-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'border-brand-purple text-brand-purple'
                      : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}

            {/* Date Range Picker - inline with tabs if provided */}
            {onDateRangeChange && (
              <div className="ml-auto flex items-center gap-2">
                <DateRangePicker
                  value={localDateRange}
                  onChange={(startDate, endDate, preset) => {
                    const newRange = { startDate, endDate, preset };
                    setLocalDateRange(newRange);
                    onDateRangeChange(startDate, endDate, preset);
                  }}
                  label={formatDateRange()}
                />
                {localDateRange?.preset && (
                  <span className="text-xs text-neutral-500 italic">
                    {getPresetLabel(localDateRange.preset)}
                  </span>
                )}
              </div>
            )}
          </nav>
        </div>
      )}

      {/* Toolbar — matches Clients tab pattern */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 mx-4 sm:mx-6 mt-4 mb-3">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          {/* Search input */}
          <div className="relative flex-shrink-0" style={{ width: '260px' }}>
            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              placeholder={searchPlaceholder || "Search to filter by: name, ID or metrics"}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Action Buttons — secondary outlined style */}
          {actionButtons.map((button, index) => {
            const isContained = button.variant === 'contained';
            if (button.label === "More" && moreMenuItems.length > 0) {
              return (
                <button
                  key={index}
                  onClick={(e) => setMoreMenuAnchor(e.currentTarget)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors"
                >
                  {button.startIcon}
                  {button.label}
                </button>
              );
            }
            if (isContained) {
              return (
                <button
                  key={index}
                  onClick={button.onClick}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-colors"
                >
                  {button.startIcon}
                  {button.label}
                </button>
              );
            }
            return (
              <button
                key={index}
                onClick={button.onClick}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors"
              >
                {button.startIcon}
                {button.label}
              </button>
            );
          })}

          {/* Custom Toolbar Actions (e.g., bulk actions) */}
          {toolbarActions && (
            <div className="ml-2">
              {toolbarActions}
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Column Configuration — matches Clients "Columns" button */}
          <button
            onClick={(e) => setColumnConfigMenuAnchor(e.currentTarget)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors"
          >
            <ViewColumnsIcon className="h-4 w-4" />
            Columns
          </button>
        </div>
      </div>

      {/* DataGrid */}
      <Box sx={{ bgcolor: 'white', mx: 2, my: 0, borderRadius: 1, overflowY: 'visible', overflowX: 'auto', pb: 2 }}>
        <DataGrid
          rows={rows}
          columns={columnsWithHeaders.map(col => {
            const hasModelWidth = columnWidthModel[col.field] !== undefined && columnWidthModel[col.field] !== null;
            // Create a new object to avoid mutating the original
            const columnConfig = { ...col };
            
            // Remove flex when we have a model width - flex conflicts with columnWidthModel
            // This is critical: flex columns cannot use columnWidthModel
            // MUI DataGrid ignores columnWidthModel for flex columns, so we must remove flex
            if (hasModelWidth && columnConfig.flex !== undefined) {
              delete columnConfig.flex;
            }
            
            // Don't set width directly - let columnWidthModel control it
            // Only set minWidth to ensure columns don't get too small
            columnConfig.minWidth = col.minWidth || 80;
            columnConfig.resizable = col.resizable !== false;
            
            return columnConfig;
          })}
          getRowId={getRowId}
          pageSizeOptions={[10, 25, 50, 100]}
          pagination={dataGridProps?.pagination !== false}
          paginationMode={dataGridProps?.paginationMode || 'client'}
          slots={{
            ...(dataGridProps?.slots || {}),
          }}
          initialState={{
            pagination: { paginationModel: { pageSize: 25, page: 0 } },
            ...(dataGridProps?.initialState || {}),
          }}
          columnWidthModel={columnWidthModel}
          onColumnWidthChange={(params) => {
            const newWidth = params.width;
            const field = params.colDef.field;
            
            // Update local state immediately - this is critical for flex columns
            // When a flex column is resized, we need to add it to the model immediately
            setColumnWidthModel(prev => {
              const updated = {
                ...prev,
                [field]: newWidth,
              };
              // Persist to localStorage via hook
              handleColumnWidthChange(field, newWidth);
              return updated;
            });
          }}
          disableRowSelectionOnClick
          disableColumnResize={false}
          sx={{
            '& .MuiDataGrid-columnHeader': {
              paddingLeft: '8px',
              paddingRight: '8px',
              paddingTop: '6px',
              paddingBottom: '6px',
            },
            '& .MuiDataGrid-cell': {
              paddingLeft: '8px',
              paddingRight: '8px',
              paddingTop: '6px !important',
              paddingBottom: '6px !important',
              display: 'flex !important',
              alignItems: 'center !important',
            },
            '& .MuiDataGrid-columnHeaders': {
              borderBottom: '1px solid #e5e7eb',
              borderTop: '1px solid #e5e7eb',
              backgroundColor: 'rgba(250, 250, 250, 0.5)',
              minHeight: '36px !important',
              '& .MuiDataGrid-columnHeader': {
                minHeight: '36px !important'
              }
            },
            '& .MuiDataGrid-row': {
              minHeight: '44px !important',
              maxHeight: '44px !important',
              '&:hover': {
                backgroundColor: 'action.hover',
              },
              '&:not(:last-child) .MuiDataGrid-cell': {
                borderBottom: '1px solid #e8e8e8',
              },
            },
            '& .MuiDataGrid-columnSeparator': { 
              display: 'flex !important',
              cursor: 'col-resize',
              '&:hover': {
                backgroundColor: 'action.hover',
              },
              '& .MuiDataGrid-iconSeparator': {
                color: 'text.secondary',
                '&:hover': {
                  color: 'primary.main',
                },
              },
            },
            '& .MuiDataGrid-scrollbar': {
              '&[aria-hidden="true"]': {
                '& *': {
                  tabIndex: '-1 !important',
                },
              },
            },
            '& .MuiDataGrid-footerContainer': {
              overflow: 'visible !important',
              display: 'flex !important',
              minHeight: '64px !important',
            },
            '& .MuiDataGrid-pagination': {
              display: 'flex !important',
              visibility: 'visible !important',
            },
            ...(dataGridProps.sx || {}),
          }}
          {...dataGridProps}
        />
      </Box>

      {/* Column Header Menu */}
      <Menu
        anchorEl={columnMenuAnchor}
        open={Boolean(columnMenuAnchor)}
        onClose={() => setColumnMenuAnchor(null)}
        PaperProps={{
          sx: {
            minWidth: 200,
            mt: 0.5,
          },
        }}
      >
        <MenuItem onClick={() => {
          setColumnMenuAnchor(null);
          // TODO: Implement sort ascending
        }}>
          <ListItemIcon>
            <ArrowUpIcon className="h-5 w-5" />
          </ListItemIcon>
          <MuiListItemText>Sort lowest to highest</MuiListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          setColumnMenuAnchor(null);
          // TODO: Implement sort descending
        }}>
          <ListItemIcon>
            <ArrowDownIcon className="h-5 w-5" />
          </ListItemIcon>
          <MuiListItemText>Sort highest to lowest</MuiListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => {
          moveColumn(selectedColumnField, 'left');
          setColumnMenuAnchor(null);
        }}>
          <ListItemIcon>
            <ChevronLeftIcon className="h-5 w-5" />
          </ListItemIcon>
          <MuiListItemText>Move left</MuiListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          moveColumn(selectedColumnField, 'right');
          setColumnMenuAnchor(null);
        }}>
          <ListItemIcon>
            <ChevronRightIcon className="h-5 w-5" />
          </ListItemIcon>
          <MuiListItemText>Move right</MuiListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => {
          toggleColumn(selectedColumnField);
          setColumnMenuAnchor(null);
        }}>
          <ListItemIcon>
            {visibleColumns.includes(selectedColumnField) ? (
              <TrashIcon className="h-5 w-5" />
            ) : (
              <PlusIcon className="h-5 w-5" />
            )}
          </ListItemIcon>
          <MuiListItemText>
            {visibleColumns.includes(selectedColumnField) ? 'Remove column' : 'Add column'}
          </MuiListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => {
          setColumnConfigMenuAnchor(columnMenuAnchor);
          setColumnMenuAnchor(null);
        }}>
          <ListItemIcon>
            <Cog6ToothIcon className="h-5 w-5" />
          </ListItemIcon>
          <MuiListItemText>Customize columns</MuiListItemText>
        </MenuItem>
        <MenuItem onClick={() => setColumnMenuAnchor(null)}>
          <ListItemIcon>
            <FunnelIcon className="h-5 w-5" />
          </ListItemIcon>
          <MuiListItemText>Filters</MuiListItemText>
        </MenuItem>
        <MenuItem onClick={() => setColumnMenuAnchor(null)}>
          <ListItemIcon>
            <ListBulletIcon className="h-5 w-5" />
          </ListItemIcon>
          <MuiListItemText>Conditional formatting</MuiListItemText>
        </MenuItem>
      </Menu>

      {/* Column Configuration Menu */}
      <Menu
        anchorEl={columnConfigMenuAnchor}
        open={Boolean(columnConfigMenuAnchor)}
        onClose={() => {
          setColumnConfigMenuAnchor(null);
          setColumnSearchQuery("");
        }}
        PaperProps={{
          sx: {
            minWidth: 300,
            maxHeight: 500,
            mt: 0.5,
          },
        }}
      >
        <Box sx={{ p: 1 }}>
          <TextField
            placeholder="Search columns"
            value={columnSearchQuery}
            onChange={(e) => setColumnSearchQuery(e.target.value)}
            size="small"
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <MagnifyingGlassIcon className="h-5 w-5" />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 1 }}
          />
          <MenuItem onClick={() => {
            toggleAllColumns();
          }}>
            <ListItemIcon>
              {allColumnsVisible ? (
                <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-blue-600"><CheckIcon className="h-3.5 w-3.5 text-white" /></span>
              ) : (
                <span className="inline-flex h-5 w-5 rounded border-2 border-gray-400" />
              )}
            </ListItemIcon>
            <MuiListItemText>Show/Hide All</MuiListItemText>
          </MenuItem>
          <Divider sx={{ my: 1 }} />
          <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
            {filteredColumnOptions.map((col) => {
              const isVisible = visibleColumns.includes(col.field);
              return (
                <MenuItem
                  key={col.field}
                  onClick={() => toggleColumn(col.field)}
                >
                  <ListItemIcon>
                    {isVisible ? (
                      <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-blue-600"><CheckIcon className="h-3.5 w-3.5 text-white" /></span>
                    ) : (
                      <span className="inline-flex h-5 w-5 rounded border-2 border-gray-400" />
                    )}
                  </ListItemIcon>
                  <MuiListItemText>{col.headerName || col.field}</MuiListItemText>
                </MenuItem>
              );
            })}
          </Box>
          <Divider sx={{ my: 1 }} />
          <MenuItem onClick={() => {
            resetColumns();
            setColumnConfigMenuAnchor(null);
          }}>
            <MuiListItemText sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
              RESET
            </MuiListItemText>
          </MenuItem>
        </Box>
      </Menu>

      {/* More Menu */}
      {moreMenuItems.length > 0 && (
        <Menu
          anchorEl={moreMenuAnchor}
          open={Boolean(moreMenuAnchor)}
          onClose={() => setMoreMenuAnchor(null)}
        >
          {moreMenuItems.map((item, index) => (
            <MenuItem key={index} onClick={() => {
              item.onClick?.();
              setMoreMenuAnchor(null);
            }}>
              {item.component || <MuiListItemText>{item.label}</MuiListItemText>}
            </MenuItem>
          ))}
        </Menu>
      )}
    </Box>
  );
}

