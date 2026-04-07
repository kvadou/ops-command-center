import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ConfirmationModal from './ConfirmationModal';
import { useToast } from '../hooks/useToast';
import {
  AcademicCapIcon,
  UsersIcon,
  BriefcaseIcon,
  CalendarIcon,
  ClipboardDocumentListIcon,
  NewspaperIcon,
  ClockIcon,
  BoltIcon,
  ChartBarIcon,
  ArrowsPointingOutIcon,
  XMarkIcon,
  ArrowPathIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { WidgetPreviewRenderer } from './WidgetPreviewRenderer';
import { RoleProvider, useRole } from '../contexts/RoleContext';
import { BranchProvider, useBranch } from '../contexts/BranchContext';

// Default widget configuration
const DEFAULT_WIDGETS = [
  {
    id: 'quick-access',
    type: 'quick-access',
    title: 'Quick Access',
    icon: BriefcaseIcon,
    x: 0,
    y: 0,
    w: 12,
    h: 2,
    minW: 6,
    minH: 2,
    visible: true,
  },
  {
    id: 'news-feed',
    type: 'news-feed',
    title: 'Company News Feed',
    icon: NewspaperIcon,
    x: 0,
    y: 2,
    w: 12,
    h: 4,
    minW: 6,
    minH: 3,
    visible: true,
  },
  {
    id: 'tasks',
    type: 'tasks',
    title: 'My Tasks',
    icon: ClipboardDocumentListIcon,
    x: 0,
    y: 6,
    w: 6,
    h: 4,
    minW: 4,
    minH: 3,
    visible: true,
  },
  {
    id: 'upcoming-lessons',
    type: 'upcoming-lessons',
    title: 'Upcoming Lessons',
    icon: CalendarIcon,
    x: 6,
    y: 6,
    w: 6,
    h: 4,
    minW: 4,
    minH: 3,
    visible: true,
  },
  {
    id: 'activity-feed',
    type: 'activity-feed',
    title: 'Activity Feed',
    icon: BoltIcon,
    x: 0,
    y: 10,
    w: 12,
    h: 3,
    minW: 6,
    minH: 2,
    visible: true,
  },
  {
    id: 'analytics',
    type: 'analytics',
    title: 'Key Metrics',
    icon: ChartBarIcon,
    x: 0,
    y: 13,
    w: 12,
    h: 2,
    minW: 6,
    minH: 2,
    visible: true,
  },
];

// Widget Preview Component (for drag overlay)
function WidgetPreview({ widget, isDragging }) {
  const Icon = widget.icon;
  return (
    <div
      className={`bg-white rounded-xl shadow-lg border-2 border-brand-purple p-4 ${
        isDragging ? 'opacity-90' : ''
      }`}
      style={{ width: '200px' }}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-brand-purple" />
        <h4 className="text-sm font-semibold text-neutral-900">{widget.title}</h4>
      </div>
      <p className="text-xs text-neutral-500 mt-1">
        {widget.w} × {widget.h} units
      </p>
    </div>
  );
}

// Sortable Widget Item
function SortableWidget({ widget, onResize, onToggleVisibility }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, w: 0, h: 0, cellWidth: 0, cellHeight: 0 });
  const widgetRef = React.useRef(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isResizing ? 'none' : transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = widget.icon;
  const gridCols = 12; // 12-column grid system

  const handleResizeStart = (e, corner) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = widgetRef.current?.getBoundingClientRect();
    const parentGrid = widgetRef.current?.closest('.grid');
    const gridRect = parentGrid?.getBoundingClientRect();
    
    if (rect && gridRect) {
      // Calculate cell size from grid container
      const cellWidth = gridRect.width / 12; // 12 columns
      const cellHeight = rect.height / widget.h; // Use widget height as reference
      
      setIsResizing(true);
      setResizeStart({
        x: e.clientX,
        y: e.clientY,
        w: widget.w,
        h: widget.h,
        cellWidth,
        cellHeight,
      });
    }
  };

  React.useEffect(() => {
    if (!isResizing || !resizeStart.cellWidth) return;

    let lastUpdate = { w: widget.w, h: widget.h };
    const throttleDelay = 50; // Throttle updates to avoid too many re-renders
    let throttleTimeout = null;

    const handleMouseMove = (e) => {
      if (throttleTimeout) return;
      
      throttleTimeout = setTimeout(() => {
        const deltaX = e.clientX - resizeStart.x;
        const deltaY = e.clientY - resizeStart.y;
        
        // Calculate grid units based on actual cell size
        const gridUnitX = Math.round(deltaX / resizeStart.cellWidth);
        const gridUnitY = Math.round(deltaY / resizeStart.cellHeight);
        
        let newW = resizeStart.w;
        let newH = resizeStart.h;

        // Update dimensions based on drag distance
        if (gridUnitX !== 0) {
          newW = Math.max(widget.minW, Math.min(gridCols, resizeStart.w + gridUnitX));
        }
        if (gridUnitY !== 0) {
          newH = Math.max(widget.minH, Math.min(10, resizeStart.h + gridUnitY));
        }

        // Only update if changed
        if (newW !== lastUpdate.w) {
          onResize(widget.id, 'w', newW - lastUpdate.w);
          lastUpdate.w = newW;
        }
        if (newH !== lastUpdate.h) {
          onResize(widget.id, 'h', newH - lastUpdate.h);
          lastUpdate.h = newH;
        }
        
        throttleTimeout = null;
      }, throttleDelay);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeStart, widget, onResize, gridCols]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group h-full ${
        widget.visible ? '' : 'opacity-40'
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      <div 
        ref={widgetRef}
        className="bg-white rounded-xl shadow-sm border-2 border-dashed border-neutral-300 p-4 hover:shadow-md hover:border-brand-purple/50 transition-all duration-200 h-full relative overflow-hidden"
      >

        {/* Widget Preview - Full size preview showing how it will look (main content) */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl z-0">
          <div className="h-full w-full">
            <div className="bg-white rounded-lg h-full opacity-70">
              <div className="[&_*]:!font-semibold [&_h3]:!font-bold [&_h4]:!font-semibold [&_p]:!font-medium">
                <WidgetPreviewRenderer widgetType={widget.type} />
              </div>
            </div>
          </div>
        </div>

        {/* Config Controls - Overlay on top, minimal visibility */}
        <div className="relative z-10 flex items-start justify-between p-2 bg-white/80 backdrop-blur-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Drag Handle */}
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1.5 rounded bg-brand-purple/20 hover:bg-brand-purple/30 transition-colors"
            title="Drag to reorder"
          >
            <ArrowsPointingOutIcon className="h-4 w-4 text-brand-purple" />
          </div>
          
          {/* Close Button */}
          <button
            onClick={() => onToggleVisibility(widget.id)}
            className={`p-1.5 rounded min-h-[28px] min-w-[28px] flex items-center justify-center ${
              widget.visible
                ? 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'
                : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
            }`}
            title={widget.visible ? 'Hide widget' : 'Show widget'}
          >
            <XMarkIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        
        {/* Size indicator - Bottom right, minimal */}
        <div className="absolute bottom-2 right-2 z-10 px-2 py-1 bg-white/90 backdrop-blur-sm rounded text-xs text-neutral-600 opacity-0 group-hover:opacity-100 transition-opacity">
          {widget.w} × {widget.h}
        </div>

        {/* Resize Handle - Bottom Right Corner */}
        <div
          onMouseDown={(e) => handleResizeStart(e, 'bottom-right')}
          className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize z-20"
          title="Drag corner to resize"
        >
          <div className="absolute bottom-0 right-0 w-0 h-0 border-l-[16px] border-l-transparent border-b-[16px] border-b-brand-purple/50 group-hover:border-b-brand-purple/70 transition-colors" />
          <div className="absolute bottom-1 right-1 w-2 h-2 bg-brand-purple/30 group-hover:bg-brand-purple/50 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export default function HomePageConfig() {
  const toast = useToast();
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });
  const [widgets, setWidgets] = useState(DEFAULT_WIDGETS);
  const [activeId, setActiveId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);
  const [dragOverPosition, setDragOverPosition] = useState(null);
  const navigate = useNavigate();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData && userData !== 'undefined') {
      try {
        const parsed = JSON.parse(userData);
        setUser(parsed);
        loadConfig(parsed);
      } catch (e) {
        console.error('Error parsing user data:', e);
      }
    }
  }, []);

  const loadConfig = async (userData) => {
    try {
      const response = await fetch('/api/home-page-config', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.config && data.config.layout_config) {
          // Merge saved config with default widgets
          const savedWidgets = data.config.layout_config;
          const mergedWidgets = DEFAULT_WIDGETS.map(defaultWidget => {
            const saved = savedWidgets.find(w => w.id === defaultWidget.id);
            return saved ? { ...defaultWidget, ...saved } : defaultWidget;
          });
          setWidgets(mergedWidgets);
        }
      }
    } catch (error) {
      console.error('Error loading config:', error);
    }
  };

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
    setDragOverPosition(null);
  };

  const handleDragOver = (event) => {
    if (!activeId) return;
    
    const activeWidget = widgets.find(w => w.id === activeId);
    if (!activeWidget) return;

    // Use mouse position from the event
    const mouseEvent = event.activatorEvent || window.event;
    if (!mouseEvent) return;

    // Get the grid container
    const gridContainer = document.querySelector('.grid.grid-cols-12.gap-3');
    if (!gridContainer) return;

    const gridRect = gridContainer.getBoundingClientRect();
    const mouseX = mouseEvent.clientX || 0;
    const mouseY = mouseEvent.clientY || 0;
    
    const relativeX = mouseX - gridRect.left;
    const relativeY = mouseY - gridRect.top;
    
    // Account for gap (gap-3 = 12px)
    const gap = 12;
    const totalGaps = 11; // 12 columns = 11 gaps
    const cellWidth = (gridRect.width - (totalGaps * gap)) / 12;
    const cellHeight = 60; // Approximate cell height
    
    // Calculate grid position
    let gridX = Math.floor(relativeX / (cellWidth + gap));
    let gridY = Math.floor(relativeY / (cellHeight + gap));
    
    // Clamp to valid grid positions
    gridX = Math.max(0, Math.min(12 - activeWidget.w, gridX));
    gridY = Math.max(0, gridY);
    
    setDragOverPosition({ x: gridX, y: gridY });
  };

  // Track mouse position during drag
  useEffect(() => {
    if (!activeId) {
      setDragOverPosition(null);
      return;
    }

    const handleMouseMove = (e) => {
      const activeWidget = widgets.find(w => w.id === activeId);
      if (!activeWidget) return;

      const gridContainer = document.querySelector('.grid.grid-cols-12.gap-3');
      if (!gridContainer) return;

      const gridRect = gridContainer.getBoundingClientRect();
      const relativeX = e.clientX - gridRect.left;
      const relativeY = e.clientY - gridRect.top;
      
      const gap = 12;
      const totalGaps = 11;
      const cellWidth = (gridRect.width - (totalGaps * gap)) / 12;
      const cellHeight = 60;
      
      let gridX = Math.floor(relativeX / (cellWidth + gap));
      let gridY = Math.floor(relativeY / (cellHeight + gap));
      
      gridX = Math.max(0, Math.min(12 - activeWidget.w, gridX));
      gridY = Math.max(0, gridY);
      
      setDragOverPosition({ x: gridX, y: gridY });
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [activeId, widgets]);

  const handleDragCancel = () => {
    setActiveId(null);
    setDragOverPosition(null);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);
    setDragOverPosition(null);

    if (over && active.id !== over.id) {
      setWidgets((items) => {
        // Get all visible widgets sorted by position
        const visibleItems = items.filter(w => w.visible).sort((a, b) => {
          if (a.y !== b.y) return a.y - b.y;
          return a.x - b.x;
        });
        const hiddenItems = items.filter(w => !w.visible);
        
        // Find indices in the sorted visible items array
        const activeVisibleIndex = visibleItems.findIndex((item) => item.id === active.id);
        const overVisibleIndex = visibleItems.findIndex((item) => item.id === over.id);
        
        if (activeVisibleIndex === -1 || overVisibleIndex === -1) {
          return items; // Can't reorder if not found
        }
        
        // Reorder visible items
        const reorderedVisible = arrayMove(visibleItems, activeVisibleIndex, overVisibleIndex);
        
        // Recalculate grid positions maintaining side-by-side layout where possible
        // Build positions incrementally to avoid reference errors
        const reorderedWithPositions = [];
        for (let index = 0; index < reorderedVisible.length; index++) {
          const widget = reorderedVisible[index];
          let y = 0;
          let x = 0;
          
          // Check previous widgets to find available space
          for (let i = 0; i < index; i++) {
            const prev = reorderedWithPositions[i];
            // If previous widget ends at current y and there's space, place side-by-side
            if (prev.y + prev.h === y && x + widget.w <= 12) {
              x = prev.x + prev.w;
            } else {
              // Move to next row
              y = Math.max(y, prev.y + prev.h);
              x = 0;
            }
          }
          
          // Ensure widget fits in row
          if (x + widget.w > 12) {
            const maxHeight = reorderedWithPositions.length > 0 
              ? Math.max(...reorderedWithPositions.map(w => w.y + w.h), 0)
              : 0;
            y = maxHeight;
            x = 0;
          }
          
          reorderedWithPositions.push({ ...widget, y, x });
        }
        
        // Combine with hidden items (keep their original positions)
        return [...reorderedWithPositions, ...hiddenItems];
      });
    }
  };

  // Check if two widgets overlap
  const widgetsOverlap = (w1, w2) => {
    if (!w1.visible || !w2.visible || w1.id === w2.id) return false;
    return !(
      w1.x + w1.w <= w2.x ||
      w2.x + w2.w <= w1.x ||
      w1.y + w1.h <= w2.y ||
      w2.y + w2.h <= w1.y
    );
  };

  // Auto-adjust widget positions to prevent overlaps
  const adjustWidgetPositions = (widgets, resizedWidget) => {
    const adjusted = widgets.map(w => ({ ...w }));
    const resized = adjusted.find(w => w.id === resizedWidget.id);
    if (!resized || !resized.visible) return adjusted;

    // Get all visible widgets except the resized one, sorted by position
    const otherWidgets = adjusted
      .filter(w => w.visible && w.id !== resized.id)
      .sort((a, b) => {
        if (a.y !== b.y) return a.y - b.y;
        return a.x - b.x;
      });

    // Check each widget for overlap with resized widget
    for (const widget of otherWidgets) {
      if (widgetsOverlap(resized, widget)) {
        // Try moving widget to the right of resized widget
        let newX = resized.x + resized.w;
        let newY = widget.y;

        // If moving right would go out of bounds, move down
        if (newX + widget.w > 12) {
          newX = 0;
          newY = resized.y + resized.h;
        }

        // Check if new position conflicts with other widgets
        const tempWidget = { ...widget, x: newX, y: newY };
        const hasConflict = adjusted.some(w => 
          w.id !== widget.id && 
          w.id !== resized.id && 
          w.visible && 
          widgetsOverlap(tempWidget, w)
        );

        if (!hasConflict) {
          const widgetIndex = adjusted.findIndex(w => w.id === widget.id);
          if (widgetIndex !== -1) {
            adjusted[widgetIndex] = { ...widget, x: newX, y: newY };
          }
        } else {
          // If conflict, move further down
          newY = resized.y + resized.h;
          const widgetIndex = adjusted.findIndex(w => w.id === widget.id);
          if (widgetIndex !== -1) {
            adjusted[widgetIndex] = { ...widget, x: 0, y: newY };
          }
        }
      }
    }

    return adjusted;
  };

  const handleResize = (widgetId, dimension, delta) => {
    setWidgets((items) => {
      // First, update the resized widget
      const updated = items.map((widget) => {
        if (widget.id === widgetId) {
          const newValue = Math.max(
            widget.minW && dimension === 'w' ? widget.minW : (widget.minH && dimension === 'h' ? widget.minH : 1),
            Math.min(
              dimension === 'w' ? 12 : 10,
              widget[dimension] + delta
            )
          );
          return { ...widget, [dimension]: newValue };
        }
        return widget;
      });

      // Find the resized widget
      const resizedWidget = updated.find(w => w.id === widgetId);
      if (resizedWidget && resizedWidget.visible) {
        // Auto-adjust positions to prevent overlaps
        return adjustWidgetPositions(updated, resizedWidget);
      }

      return updated;
    });
  };

  const handleToggleVisibility = (widgetId) => {
    setWidgets((items) => {
      return items.map((widget) => {
        if (widget.id === widgetId) {
          return { ...widget, visible: !widget.visible };
        }
        return widget;
      });
    });
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const layoutConfig = widgets
        .filter(w => w.visible) // Only save visible widgets
        .sort((a, b) => {
          // Sort by y position, then by x
          if (a.y !== b.y) return a.y - b.y;
          return a.x - b.x;
        })
        .map((w, index) => ({
        id: w.id,
        type: w.type,
        x: w.x,
        y: w.y,
        w: w.w,
        h: w.h,
        visible: w.visible,
        order: index, // Add order for rendering
      }));

      const response = await fetch('/api/home-page-config', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          layout_config: layoutConfig,
        }),
      });

      if (response.ok) {
        // Show success message and navigate back
        toast.success('Home page configuration saved successfully!');
        navigate('/home');
      } else {
        const error = await response.json();
        toast.error(`Failed to save: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfirmState({
      isOpen: true,
      title: 'Reset Layout',
      message: 'Reset to default layout? This will discard all your customizations.',
      action: () => setWidgets(DEFAULT_WIDGETS)
    });
  };

  const visibleWidgets = widgets.filter(w => w.visible);
  const sortedWidgets = [...visibleWidgets].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData && userData !== 'undefined') {
      try {
        setUser(JSON.parse(userData));
      } catch (e) {
        console.error('Error parsing user data:', e);
      }
    }
  }, []);

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <RoleProvider user={user}>
      <BranchProvider user={user}>
          <div className="max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-6 mb-4 sm:mb-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-neutral-900">
                Customize Home Page
              </h1>
              <p className="text-sm text-neutral-600 mt-1">
                Drag and drop widgets to rearrange, resize them, and toggle visibility
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="px-4 py-2.5 sm:py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors text-sm font-medium min-h-[44px] sm:min-h-0 flex items-center justify-center gap-2"
              >
                <ArrowPathIcon className="h-4 w-4 flex-shrink-0" />
                <span>Reset to Default</span>
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2.5 sm:py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors text-sm font-medium min-h-[44px] sm:min-h-0 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <CheckIcon className="h-4 w-4 flex-shrink-0" />
                    <span>Save Configuration</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Drag and Drop Grid - Shows widgets in their actual grid positions with proper spacing */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext
            items={sortedWidgets.map(w => w.id)}
            strategy={undefined}
          >
            <div 
              className="grid grid-cols-12 gap-3 relative bg-gradient-to-br from-neutral-50/30 via-transparent to-neutral-50/30 rounded-lg p-2"
              style={{
                gridAutoRows: 'min-content',
                minHeight: '600px',
              }}
            >
              {/* Grid Background - Subtle visual guide showing available drop zones */}
              <div className="absolute inset-0 pointer-events-none z-0" style={{ opacity: 0.15 }}>
                <div className="h-full w-full grid grid-cols-12 gap-3">
                  {Array.from({ length: 12 * 20 }).map((_, idx) => {
                    return (
                      <div
                        key={idx}
                        className="border border-dashed border-neutral-300/50"
                        style={{ minHeight: '60px' }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Drop Preview - Shows where widget will be placed */}
              {activeId && dragOverPosition && (() => {
                const activeWidget = widgets.find(w => w.id === activeId);
                if (!activeWidget) return null;
                
                // Check if position conflicts with other widgets
                const conflicts = sortedWidgets.some(w => 
                  w.id !== activeId &&
                  w.visible &&
                  !(dragOverPosition.x + activeWidget.w <= w.x ||
                    w.x + w.w <= dragOverPosition.x ||
                    dragOverPosition.y + activeWidget.h <= w.y ||
                    w.y + w.h <= dragOverPosition.y)
                );
                
                return (
                  <div
                    className="absolute pointer-events-none z-10 border-2 border-dashed rounded-lg transition-all animate-pulse"
                    style={{
                      gridColumn: `${dragOverPosition.x + 1} / ${dragOverPosition.x + activeWidget.w + 1}`,
                      gridRow: `${dragOverPosition.y + 1} / ${dragOverPosition.y + activeWidget.h + 1}`,
                      borderColor: conflicts ? '#ef4444' : '#6A469D',
                      backgroundColor: conflicts ? 'rgba(239, 68, 68, 0.1)' : 'rgba(106, 70, 157, 0.1)',
                    }}
                  >
                    <div className="h-full w-full flex items-center justify-center">
                      <div className={`font-semibold text-sm ${conflicts ? 'text-red-600' : 'text-brand-purple'}`}>
                        {conflicts ? 'Overlap!' : 'Drop here'}
                      </div>
                    </div>
                  </div>
                );
              })()}
              {sortedWidgets.map((widget) => {
                // Calculate grid position - use row span based on height
                const gridRowStart = widget.y + 1;
                const gridRowEnd = widget.y + widget.h + 1;
                const gridColStart = widget.x + 1;
                const gridColEnd = widget.x + widget.w + 1;

                return (
                  <div
                    key={widget.id}
                    style={{
                      gridColumn: `${gridColStart} / ${gridColEnd}`,
                      gridRow: `${gridRowStart} / ${gridRowEnd}`,
                    }}
                  >
                    <SortableWidget
                      widget={widget}
                      onResize={handleResize}
                      onToggleVisibility={handleToggleVisibility}
                    />
                  </div>
                );
              })}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeId ? (
              <div className="w-80">
                <WidgetPreview
                  widget={widgets.find(w => w.id === activeId)}
                  isDragging={true}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* Hidden Widgets Section */}
        {widgets.some(w => !w.visible) && (
          <div className="mt-6 bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-6">
            <h3 className="text-sm font-semibold text-neutral-700 mb-4">Hidden Widgets</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {widgets
                .filter(w => !w.visible)
                .map((widget) => {
                  const Icon = widget.icon;
                  return (
                    <button
                      key={widget.id}
                      onClick={() => handleToggleVisibility(widget.id)}
                      className="p-4 bg-neutral-50 rounded-lg hover:bg-neutral-100 transition-colors text-center"
                    >
                      <Icon className="h-6 w-6 text-neutral-400 mx-auto mb-2" />
                      <p className="text-xs text-neutral-600">{widget.title}</p>
                    </button>
                  );
                })}
            </div>
          </div>
        )}
          </div>
      </BranchProvider>

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
        onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
        title={confirmState.title}
        message={confirmState.message}
      />
    </RoleProvider>
  );
}
