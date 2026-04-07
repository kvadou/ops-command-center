import React, { useState } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  DocumentTextIcon,
  ClipboardDocumentListIcon,
  VideoCameraIcon,
  FolderIcon,
  EllipsisVerticalIcon,
} from '@heroicons/react/24/outline';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const CONTENT_TYPE_ICONS = {
  document: DocumentTextIcon,
  checklist: ClipboardDocumentListIcon,
  video: VideoCameraIcon,
};

function SortableTreeItem({ item, type, parentId, isSelected, onSelect, onMenuAction }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const Icon = CONTENT_TYPE_ICONS[item.content_type] || DocumentTextIcon;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `${type}-${item.id}`, data: { type, item, parentId } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-start gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
        isSelected
          ? 'bg-brand-purple/10 text-brand-purple'
          : 'hover:bg-neutral-100 text-neutral-700'
      } ${isDragging ? 'shadow-lg bg-white ring-2 ring-brand-purple/30' : ''}`}
      onClick={() => onSelect(item, type)}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab opacity-0 group-hover:opacity-100 mt-0.5 hover:bg-neutral-200 rounded p-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        <svg className="h-4 w-4 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
          <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
        </svg>
      </div>
      <Icon className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <span className="flex-1 text-sm leading-tight">{item.title}</span>
      {item.is_required && (
        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded flex-shrink-0 mt-0.5">
          Req
        </span>
      )}
      <div className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-neutral-200 rounded"
        >
          <EllipsisVerticalIcon className="h-4 w-4 text-neutral-500" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-20">
              <button
                onClick={(e) => { e.stopPropagation(); onMenuAction('duplicate', { ...item, parentId }); setMenuOpen(false); }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
              >
                Duplicate
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onMenuAction('move', { ...item, type, parentId }); setMenuOpen(false); }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
              >
                Move to...
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onMenuAction('delete', item); setMenuOpen(false); }}
                className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TreeSection({ title, icon: Icon, children, onAdd, addLabel, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-start gap-2 w-full px-2 py-1.5 text-sm font-semibold text-neutral-600 hover:bg-neutral-50 rounded-lg"
      >
        {expanded ? (
          <ChevronDownIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
        ) : (
          <ChevronRightIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
        )}
        <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <span className="flex-1 text-left leading-tight">{title}</span>
      </button>
      {expanded && (
        <div className="ml-2 mt-1 space-y-1">
          {children}
          {onAdd && (
            <button
              onClick={onAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-brand-purple hover:bg-brand-purple/5 rounded-lg w-full"
            >
              <PlusIcon className="h-4 w-4" />
              {addLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ContentTree({
  program,
  phases,
  resources,
  selectedItem,
  onSelect,
  onAddPhase,
  onAddModule,
  onAddResource,
  onMenuAction,
  onReorder,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Only allow reordering within the same parent/type
    if (activeData.type !== overData.type) return;
    if (activeData.parentId !== overData.parentId) return;

    // Get the items array based on type
    let items;
    if (activeData.type === 'module') {
      const phase = phases.find(p => p.id === activeData.parentId);
      items = phase?.modules || [];
    } else if (activeData.type === 'resource') {
      items = resources[activeData.parentId] || [];
    }

    if (!items.length) return;

    // Find indices
    const oldIndex = items.findIndex(item => `${activeData.type}-${item.id}` === active.id);
    const newIndex = items.findIndex(item => `${overData.type}-${item.id}` === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Get new order
    const newOrder = arrayMove(items, oldIndex, newIndex).map(item => item.id);

    // Call reorder handler
    if (onReorder) {
      onReorder({
        type: activeData.type === 'module' ? 'modules' : 'resources',
        parentId: activeData.parentId,
        order: newOrder,
      });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full overflow-y-auto p-3">
        {/* 90-Day Journey */}
        <TreeSection
          title="90-Day Journey"
          icon={DocumentTextIcon}
          onAdd={onAddPhase}
          addLabel="Add Phase"
        >
          {phases.map((phase) => (
            <TreeSection
              key={phase.id}
              title={`Phase ${phase.phase_number}: ${phase.title}`}
              icon={FolderIcon}
              onAdd={() => onAddModule(phase.id)}
              addLabel="Add Module"
            >
              <SortableContext
                items={(phase.modules || []).map(m => `module-${m.id}`)}
                strategy={verticalListSortingStrategy}
              >
                {phase.modules?.map((module) => (
                  <SortableTreeItem
                    key={module.id}
                    item={module}
                    type="module"
                    parentId={phase.id}
                    isSelected={selectedItem?.type === 'module' && selectedItem?.id === module.id}
                    onSelect={(item) => onSelect({ ...item, type: 'module', phase_id: phase.id })}
                    onMenuAction={onMenuAction}
                  />
                ))}
              </SortableContext>
            </TreeSection>
          ))}
        </TreeSection>

        {/* Resource Library */}
        <TreeSection
          title="Resource Library"
          icon={FolderIcon}
          onAdd={() => onAddResource()}
          addLabel="Add Document"
        >
          {Object.entries(resources).map(([category, docs]) => (
            <TreeSection
              key={category}
              title={category.charAt(0).toUpperCase() + category.slice(1)}
              icon={FolderIcon}
              defaultExpanded={false}
            >
              <SortableContext
                items={(docs || []).map(d => `resource-${d.id}`)}
                strategy={verticalListSortingStrategy}
              >
                {docs.map((doc) => (
                  <SortableTreeItem
                    key={doc.id}
                    item={{ ...doc, content_type: 'document' }}
                    type="resource"
                    parentId={category}
                    isSelected={selectedItem?.type === 'resource' && selectedItem?.id === doc.id}
                    onSelect={(item) => onSelect({ ...item, type: 'resource', category })}
                    onMenuAction={onMenuAction}
                  />
                ))}
              </SortableContext>
            </TreeSection>
          ))}
        </TreeSection>
      </div>
    </DndContext>
  );
}
