import React, { useState, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowsPointingOutIcon, XMarkIcon } from '@heroicons/react/24/outline';

/**
 * ConfigurableWidget - Wraps any widget to make it configurable
 * Shows drag handles and resize controls when in config mode
 */
export default function ConfigurableWidget({
  id,
  widget,
  children,
  configMode,
  onResize,
  onToggleVisibility,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, w: 0, h: 0, cellWidth: 0, cellHeight: 0 });
  const widgetRef = useRef(null);

  const handleResizeStart = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = widgetRef.current?.getBoundingClientRect();
    const container = widgetRef.current?.closest('.max-w-7xl') || widgetRef.current?.parentElement;
    const containerRect = container?.getBoundingClientRect();
    
    if (rect && containerRect) {
      // Use container width for width calculations (12-column grid equivalent)
      const cellWidth = containerRect.width / 12;
      // Use current height for height calculations (pixel-based)
      const baseHeight = rect.height;
      
      setIsResizing(true);
      setResizeStart({
        x: e.clientX,
        y: e.clientY,
        w: widget.w || 12,
        h: widget.h || 2,
        cellWidth,
        baseHeight,
        startWidth: rect.width,
        startHeight: rect.height,
      });
    }
  };

  useEffect(() => {
    if (!isResizing || !resizeStart.cellWidth) return;

    const handleMouseMove = (e) => {
      const deltaX = e.clientX - resizeStart.x;
      const deltaY = e.clientY - resizeStart.y;
      
      // Calculate width change in grid units (12-column system)
      const gridUnitX = Math.round(deltaX / resizeStart.cellWidth);
      
      // Calculate height change - use a base unit (e.g., 50px per unit)
      // This makes resizing feel natural
      const heightUnit = 50; // pixels per height unit
      const gridUnitY = Math.round(deltaY / heightUnit);
      
      let newW = resizeStart.w;
      let newH = resizeStart.h;

      // Update width if changed
      if (gridUnitX !== 0) {
        newW = Math.max(widget.minW || 6, Math.min(12, resizeStart.w + gridUnitX));
        if (newW !== widget.w) {
          onResize(widget.id, 'w', newW - (widget.w || 12));
        }
      }
      
      // Update height if changed
      if (gridUnitY !== 0) {
        newH = Math.max(widget.minH || 1, Math.min(10, resizeStart.h + gridUnitY));
        if (newH !== widget.h) {
          onResize(widget.id, 'h', newH - (widget.h || 2));
        }
      }
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
  }, [isResizing, resizeStart, widget, onResize]);

  if (!configMode) {
    // Normal mode - just render the widget
    return <>{children}</>;
  }

  // Config mode - add controls
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group"
    >
      <div
        ref={widgetRef}
        className="relative"
        style={{
          border: '2px dashed #6A469D',
          borderRadius: '0.75rem',
          padding: '2px',
        }}
      >
        {/* Drag Handle - Always visible, larger, on left side with four-directional arrows */}
        <div
          {...attributes}
          {...listeners}
          className="absolute left-0 top-0 bottom-0 w-8 cursor-grab active:cursor-grabbing flex items-center justify-center bg-brand-purple/5 hover:bg-brand-purple/10 transition-colors z-10 rounded-l-lg"
          title="Drag to reorder"
        >
          <ArrowsPointingOutIcon className="w-5 h-5 text-brand-purple" />
        </div>

        {/* Hide Button - Top Right */}
        {onToggleVisibility && (
          <button
            onClick={() => onToggleVisibility(widget.id)}
            className="absolute top-2 right-2 p-1.5 rounded bg-white/90 backdrop-blur-sm hover:bg-neutral-100 transition-colors z-10 opacity-0 group-hover:opacity-100"
            title="Hide widget"
          >
            <XMarkIcon className="h-4 w-4 text-neutral-600" />
          </button>
        )}

        {/* Resize Handle - Bottom Right Corner - Always visible in config mode */}
        <div
          onMouseDown={handleResizeStart}
          className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize z-20 bg-brand-purple/20 hover:bg-brand-purple/30 transition-colors rounded-tl-lg flex items-center justify-center"
          title="Drag corner to resize"
        >
          <div className="w-3 h-3 border-r-2 border-b-2 border-brand-purple/70 rounded-br-sm" />
        </div>

        {/* Widget Content - Add left padding to account for drag handle */}
        <div className="w-full h-full pl-10">
          {children}
        </div>
      </div>
    </div>
  );
}
