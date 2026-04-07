import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import {
  ChevronDownIcon,
  ChevronUpIcon,
  TrashIcon,
  Bars3Icon,
  DocumentTextIcon,
  VideoCameraIcon,
  PhotoIcon,
  PaperClipIcon,
  LightBulbIcon,
  ClipboardDocumentListIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline';
import {
  TextBlockEditor,
  VideoBlockEditor,
  ImageBlockEditor,
  FileBlockEditor,
  CalloutBlockEditor,
  ChecklistBlockEditor,
  QuizBlockEditor,
} from './blocks';
import { marked } from 'marked';
import ConfirmationModal from '../../ConfirmationModal';

const BLOCK_TYPES = [
  { type: 'text', label: 'Text', icon: DocumentTextIcon },
  { type: 'video', label: 'Video', icon: VideoCameraIcon },
  { type: 'image', label: 'Image', icon: PhotoIcon },
  { type: 'file', label: 'File', icon: PaperClipIcon },
  { type: 'callout', label: 'Callout', icon: LightBulbIcon },
  { type: 'checklist', label: 'Checklist', icon: ClipboardDocumentListIcon },
  { type: 'quiz', label: 'Quiz', icon: QuestionMarkCircleIcon },
];

const BLOCK_EDITORS = {
  text: TextBlockEditor,
  video: VideoBlockEditor,
  image: ImageBlockEditor,
  file: FileBlockEditor,
  callout: CalloutBlockEditor,
  checklist: ChecklistBlockEditor,
  quiz: QuizBlockEditor,
};

function SortableBlock({ block, index, expanded, onToggle, onChange, onDelete, onMoveUp, onMoveDown, onUpload, isFirst, isLast }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const BlockEditor = BLOCK_EDITORS[block.type];
  const blockType = BLOCK_TYPES.find(t => t.type === block.type);
  const Icon = blockType?.icon || DocumentTextIcon;

  return (
    <div ref={setNodeRef} style={style} className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-neutral-50 border-b border-neutral-200">
        <div {...attributes} {...listeners} className="cursor-grab p-1 hover:bg-neutral-200 rounded">
          <Bars3Icon className="h-4 w-4 text-neutral-400" />
        </div>
        <Icon className="h-4 w-4 text-neutral-500" />
        <span className="flex-1 text-sm font-medium text-neutral-700 truncate">
          {block.title || `${blockType?.label || 'Block'}`}
        </span>

        {/* Mobile reorder buttons */}
        <div className="flex items-center gap-1 lg:hidden">
          <button
            onClick={() => onMoveUp(index)}
            disabled={isFirst}
            className="p-1 hover:bg-neutral-200 rounded disabled:opacity-30"
          >
            <ChevronUpIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => onMoveDown(index)}
            disabled={isLast}
            className="p-1 hover:bg-neutral-200 rounded disabled:opacity-30"
          >
            <ChevronDownIcon className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={() => onToggle(block.id)}
          className="p-1 hover:bg-neutral-200 rounded"
        >
          {expanded ? (
            <ChevronUpIcon className="h-4 w-4 text-neutral-500" />
          ) : (
            <ChevronDownIcon className="h-4 w-4 text-neutral-500" />
          )}
        </button>
        <button
          onClick={() => onDelete(block.id)}
          className="p-1 hover:bg-red-100 text-neutral-400 hover:text-red-500 rounded"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>

      {expanded && BlockEditor && (
        <div className="p-4">
          <BlockEditor
            block={block}
            onChange={(updated) => onChange(block.id, updated)}
            onUpload={onUpload}
          />
        </div>
      )}
    </div>
  );
}

// Convert legacy content to a format the editor can handle
// The AcademyRichTextEditor will handle the conversion via prepareContent
function extractLegacyContent(content) {
  if (!content) return null;

  // If it's a string, check if it's JSON with sections
  if (typeof content === 'string') {
    const trimmed = content.trim();

    // Check if it looks like JSON
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(content);
        // Recursively process the parsed content
        return extractLegacyContent(parsed);
      } catch {
        // Not valid JSON, continue
      }
    }

    // Return as-is - editor will handle markdown conversion
    return content;
  }

  // If it's a TipTap JSON structure
  if (content.type === 'doc' && content.content) {
    return JSON.stringify(content); // Store as JSON string for TipTap
  }

  // If it has sections - convert to HTML format that the editor can display
  if (content.sections && Array.isArray(content.sections)) {
    // Configure marked for GFM
    marked.setOptions({ gfm: true, breaks: true });

    return content.sections.map(s => {
      let html = '';
      if (s.title) html += `<h2>${s.title}</h2>`;
      if (s.content) {
        // Content within sections is typically markdown
        try {
          html += marked.parse(s.content);
        } catch {
          html += `<p>${s.content}</p>`;
        }
      }
      return html;
    }).join('<hr />');
  }

  // If it has html property
  if (content.html) {
    return content.html;
  }

  // If it has description
  if (content.description) {
    return content.description;
  }

  // Fallback: stringify
  return JSON.stringify(content);
}

// Process content blocks to convert any JSON sections content to proper HTML
function processContentBlocks(blocks) {
  if (!blocks || !Array.isArray(blocks)) return blocks;

  return blocks.map(block => {
    if (block.type === 'text' && block.content) {
      // Check if content is JSON with sections
      const content = block.content;
      if (typeof content === 'string') {
        const trimmed = content.trim();
        if (trimmed.startsWith('{')) {
          try {
            const parsed = JSON.parse(content);
            if (parsed.sections && Array.isArray(parsed.sections)) {
              // Convert to HTML
              return {
                ...block,
                content: extractLegacyContent(parsed)
              };
            }
          } catch {
            // Not valid JSON, keep as-is
          }
        }
      }
    }
    return block;
  });
}

export default function ModuleEditor({ module, onChange, onUpload }) {
  const [expandedBlocks, setExpandedBlocks] = useState(new Set());
  const [showBlockPicker, setShowBlockPicker] = useState(false);
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });
  const lastExpandedModuleId = useRef(null);

  // Get blocks - convert legacy content if needed
  const blocks = useMemo(() => {
    // If we have content_blocks, process them to convert any JSON sections
    if (module.content_blocks && module.content_blocks.length > 0) {
      return processContentBlocks(module.content_blocks);
    }

    // If no content_blocks but we have legacy content, create a text block from it
    const legacyContent = extractLegacyContent(module.content);
    if (legacyContent) {
      return [{
        id: `legacy_${module.id}`,
        type: 'text',
        title: '',
        content: legacyContent
      }];
    }

    return [];
  }, [module.content_blocks, module.content, module.id]);

  // Auto-expand all blocks only when switching to a different module (not on reorder)
  useEffect(() => {
    if (blocks.length > 0 && module.id !== lastExpandedModuleId.current) {
      setExpandedBlocks(new Set(blocks.map(b => b.id)));
      lastExpandedModuleId.current = module.id;
    }
  }, [blocks, module.id]);

  // When blocks change due to legacy conversion, update the module
  useEffect(() => {
    if (blocks.length > 0 && (!module.content_blocks || module.content_blocks.length === 0) && module.content) {
      // Auto-populate content_blocks from legacy content
      onChange({ ...module, content_blocks: blocks });
    }
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const toggleBlock = (blockId) => {
    setExpandedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = blocks.findIndex(b => b.id === active.id);
      const newIndex = blocks.findIndex(b => b.id === over.id);
      onChange({
        ...module,
        content_blocks: arrayMove(blocks, oldIndex, newIndex),
      });
    }
  };

  const updateBlock = (blockId, updated) => {
    onChange({
      ...module,
      content_blocks: blocks.map(b => b.id === blockId ? updated : b),
    });
  };

  const deleteBlock = (blockId) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Block',
      message: 'Delete this block?',
      action: () => {
        onChange({
          ...module,
          content_blocks: blocks.filter(b => b.id !== blockId),
        });
      },
    });
  };

  const addBlock = (type) => {
    const newBlock = {
      id: `block_${Date.now()}`,
      type,
      title: '',
      ...(type === 'callout' ? { calloutType: 'tip' } : {}),
      ...(type === 'checklist' ? { items: [] } : {}),
      ...(type === 'quiz' ? { questions: [], passing_score: 80 } : {}),
    };
    onChange({
      ...module,
      content_blocks: [...blocks, newBlock],
    });
    setExpandedBlocks(prev => new Set(prev).add(newBlock.id));
    setShowBlockPicker(false);
  };

  const moveBlock = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex >= 0 && newIndex < blocks.length) {
      onChange({
        ...module,
        content_blocks: arrayMove(blocks, index, newIndex),
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Module metadata */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Title</label>
          <input
            type="text"
            value={module.title || ''}
            onChange={(e) => onChange({ ...module, title: e.target.value })}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Description</label>
          <textarea
            value={module.description || ''}
            onChange={(e) => onChange({ ...module, description: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple resize-none"
          />
        </div>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Points</label>
            <input
              type="number"
              value={module.points_value || 10}
              onChange={(e) => onChange({ ...module, points_value: parseInt(e.target.value) })}
              min={0}
              className="w-24 px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
            />
          </div>
          <div className="flex items-center gap-4 pt-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={module.is_required || false}
                onChange={(e) => onChange({ ...module, is_required: e.target.checked })}
                className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
              />
              <span className="text-sm text-neutral-700">Required</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={module.is_gate || false}
                onChange={(e) => onChange({ ...module, is_gate: e.target.checked })}
                className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
              />
              <span className="text-sm text-neutral-700">Gate (must complete to proceed)</span>
            </label>
          </div>
        </div>
      </div>

      {/* Content blocks */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-900 mb-3">Content Blocks</h3>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {blocks.map((block, index) => (
                <SortableBlock
                  key={block.id}
                  block={block}
                  index={index}
                  expanded={expandedBlocks.has(block.id)}
                  onToggle={toggleBlock}
                  onChange={updateBlock}
                  onDelete={deleteBlock}
                  onMoveUp={() => moveBlock(index, -1)}
                  onMoveDown={() => moveBlock(index, 1)}
                  onUpload={onUpload}
                  isFirst={index === 0}
                  isLast={index === blocks.length - 1}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Add block button */}
        <div className="mt-4 relative">
          <button
            onClick={() => setShowBlockPicker(!showBlockPicker)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand-purple hover:bg-brand-purple/5 border border-brand-purple/30 rounded-lg transition-colors"
          >
            <span className="text-lg">+</span>
            Add Block
          </button>

          {showBlockPicker && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowBlockPicker(false)} />
              <div className="absolute left-0 bottom-full mb-2 bg-white rounded-lg shadow-lg border border-neutral-200 p-2 z-20 grid grid-cols-3 sm:grid-cols-4 gap-1 min-w-[280px]">
                {BLOCK_TYPES.map(({ type, label, icon: Icon }) => (
                  <button
                    key={type}
                    onClick={() => addBlock(type)}
                    className="flex flex-col items-center gap-1 p-3 hover:bg-neutral-50 rounded-lg transition-colors"
                  >
                    <Icon className="h-5 w-5 text-neutral-600" />
                    <span className="text-xs text-neutral-700">{label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState({ isOpen: false, action: null, title: '', message: '' })}
        onConfirm={() => {
          if (confirmState.action) confirmState.action();
          setConfirmState({ isOpen: false, action: null, title: '', message: '' });
        }}
        title={confirmState.title}
        message={confirmState.message}
        isDestructive
      />
    </div>
  );
}
