import { useState } from 'react';

/**
 * Reusable column resize hook for custom tables.
 * Per STC design system, ALL tables MUST have resizable columns.
 *
 * Usage:
 *   const { columnWidths, handleResizeStart, ResizeHandle } = useResizableColumns('columnWidths_myTable');
 *
 *   <th className="relative ..." style={{ width: columnWidths.colKey || 120 }}>
 *     Label
 *     <ResizeHandle colKey="colKey" />
 *   </th>
 */
export function useResizableColumns(storageKey) {
  const [columnWidths, setColumnWidths] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const handleResizeStart = (e, colKey) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = columnWidths[colKey] || 120;

    const onMouseMove = (moveEvent) => {
      const newWidth = Math.max(50, startWidth + (moveEvent.clientX - startX));
      setColumnWidths(prev => {
        const updated = { ...prev, [colKey]: newWidth };
        localStorage.setItem(storageKey, JSON.stringify(updated));
        return updated;
      });
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return { columnWidths, handleResizeStart };
}

export function ResizeHandle({ colKey, onResizeStart }) {
  return (
    <div
      className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize hover:bg-primary-500/20 group z-10"
      onMouseDown={(e) => onResizeStart(e, colKey)}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mx-auto w-px h-full bg-neutral-200 group-hover:bg-primary-500/40" />
    </div>
  );
}
