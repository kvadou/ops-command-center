import { useState, useCallback } from 'react';

/**
 * Custom hook for managing column visibility and configuration
 * Persists to localStorage by page path
 * 
 * @param {string} pagePath - Unique identifier for the page (e.g., '/booking-forms/submissions')
 * @param {Array} defaultColumns - Default column definitions
 * @returns {Object} - Column configuration state and methods
 */
export function useColumnConfig(pagePath, defaultColumns) {
  const storageKey = `columnConfig_v2_${pagePath}`;
  const defaultFields = defaultColumns.map(col => col.field);
  const defaultFieldsSet = new Set(defaultFields);

  // Check if saved config still matches current columns; reset if columns were added/removed
  const getSavedOrDefault = (field) => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        const savedOrder = parsed.columnOrder || [];
        const savedSet = new Set(savedOrder);
        // Reset if any column was added or removed
        if (savedOrder.length !== defaultFields.length ||
            defaultFields.some(f => !savedSet.has(f)) ||
            savedOrder.some(f => !defaultFieldsSet.has(f))) {
          localStorage.removeItem(storageKey);
          return null;
        }
        return parsed[field];
      }
    } catch (error) {
      console.error('Error loading column config:', error);
    }
    return null;
  };

  // Initialize visible columns from localStorage or default
  const [visibleColumns, setVisibleColumns] = useState(() => {
    return getSavedOrDefault('visibleColumns') || defaultFields;
  });

  // Initialize column order from localStorage or default
  const [columnOrder, setColumnOrder] = useState(() => {
    return getSavedOrDefault('columnOrder') || defaultFields;
  });

  // Initialize column widths from localStorage or default
  const [columnWidths, setColumnWidths] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.columnWidths || {};
      }
    } catch (error) {
      console.error('Error loading column config:', error);
    }
    return {};
  });

  // Save configuration to localStorage
  const saveConfig = useCallback((visibleCols, order, widths = null) => {
    try {
      const config = {
        visibleColumns: visibleCols,
        columnOrder: order,
        columnWidths: widths !== null ? widths : columnWidths,
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem(storageKey, JSON.stringify(config));
    } catch (error) {
      console.error('Error saving column config:', error);
    }
  }, [storageKey, columnWidths]);

  // Toggle column visibility
  const toggleColumn = useCallback((field) => {
    setVisibleColumns(prev => {
      const newVisible = prev.includes(field)
        ? prev.filter(f => f !== field)
        : [...prev, field];
      saveConfig(newVisible, columnOrder);
      return newVisible;
    });
  }, [columnOrder, saveConfig]);

  // Show/hide all columns
  const toggleAllColumns = useCallback(() => {
    const allFields = defaultColumns.map(col => col.field);
    const newVisible = visibleColumns.length === allFields.length
      ? []
      : allFields;
    setVisibleColumns(newVisible);
    saveConfig(newVisible, columnOrder);
  }, [defaultColumns, visibleColumns.length, columnOrder, saveConfig]);

  // Reset to default
  const resetColumns = useCallback(() => {
    const defaultFields = defaultColumns.map(col => col.field);
    setVisibleColumns(defaultFields);
    setColumnOrder(defaultFields);
    saveConfig(defaultFields, defaultFields);
  }, [defaultColumns, saveConfig]);

  // Move column left/right
  const moveColumn = useCallback((field, direction) => {
    setColumnOrder(prev => {
      const index = prev.indexOf(field);
      if (index === -1) return prev;
      
      const newOrder = [...prev];
      if (direction === 'left' && index > 0) {
        [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
      } else if (direction === 'right' && index < newOrder.length - 1) {
        [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
      }
      
      saveConfig(visibleColumns, newOrder);
      return newOrder;
    });
  }, [visibleColumns, saveConfig]);

  // Get filtered and ordered columns with persisted widths
  const getFilteredColumns = useCallback(() => {
    // Filter visible columns
    const visible = defaultColumns.filter(col => 
      visibleColumns.includes(col.field)
    );
    
    // Sort by column order
    const sorted = visible.sort((a, b) => {
      const indexA = columnOrder.indexOf(a.field);
      const indexB = columnOrder.indexOf(b.field);
      return indexA - indexB;
    });
    
    // Apply persisted widths (preserve flex for columns that haven't been manually resized)
    return sorted.map(col => {
      if (columnWidths[col.field]) {
        return { ...col, width: columnWidths[col.field] };
      }
      if (col.flex) {
        return col; // preserve flex — don't override with a fixed width
      }
      return { ...col, width: col.width || col.minWidth || 150 };
    });
  }, [defaultColumns, visibleColumns, columnOrder, columnWidths]);

  // Handle column width change
  const handleColumnWidthChange = useCallback((field, width) => {
    setColumnWidths(prev => {
      const newWidths = {
        ...prev,
        [field]: width,
      };
      saveConfig(visibleColumns, columnOrder, newWidths);
      return newWidths;
    });
  }, [visibleColumns, columnOrder, saveConfig]);

  // Check if all columns are visible
  const allColumnsVisible = visibleColumns.length === defaultColumns.length;

  return {
    visibleColumns,
    columnOrder,
    columnWidths,
    filteredColumns: getFilteredColumns(),
    toggleColumn,
    toggleAllColumns,
    resetColumns,
    moveColumn,
    handleColumnWidthChange,
    allColumnsVisible,
  };
}

