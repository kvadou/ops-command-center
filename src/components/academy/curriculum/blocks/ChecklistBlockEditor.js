import React from 'react';
import { PlusIcon, TrashIcon, LinkIcon } from '@heroicons/react/24/outline';

export default function ChecklistBlockEditor({ block, onChange }) {
  const items = block.items || [];

  const addItem = () => {
    onChange({
      ...block,
      items: [...items, {
        id: Date.now().toString(),
        title: '',
        description: '',
        helpLink: '',
        dueDay: null,
        points: 0
      }]
    });
  };

  const updateItem = (index, updates) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], ...updates };
    onChange({ ...block, items: newItems });
  };

  const removeItem = (index) => {
    onChange({ ...block, items: items.filter((_, i) => i !== index) });
  };

  const moveItem = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= items.length) return;
    const newItems = [...items];
    [newItems[index], newItems[newIndex]] = [newItems[newIndex], newItems[index]];
    onChange({ ...block, items: newItems });
  };

  return (
    <div className="space-y-4">
      <input
        type="text"
        value={block.title || ''}
        onChange={(e) => onChange({ ...block, title: e.target.value })}
        placeholder="Checklist title"
        className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
      />
      <textarea
        value={block.description || ''}
        onChange={(e) => onChange({ ...block, description: e.target.value })}
        placeholder="Checklist description (optional)"
        rows={2}
        className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple resize-none"
      />

      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={item.id} className="border border-neutral-200 rounded-lg p-3 bg-neutral-50">
            <div className="flex items-start gap-2">
              <div className="flex flex-col gap-1 pt-2">
                <button
                  onClick={() => moveItem(index, -1)}
                  disabled={index === 0}
                  className="p-1 text-neutral-400 hover:text-neutral-600 disabled:opacity-30"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveItem(index, 1)}
                  disabled={index === items.length - 1}
                  className="p-1 text-neutral-400 hover:text-neutral-600 disabled:opacity-30"
                  title="Move down"
                >
                  ↓
                </button>
              </div>
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={item.title}
                  onChange={(e) => updateItem(index, { title: e.target.value })}
                  placeholder="Item title"
                  className="w-full px-2 py-1.5 border border-neutral-200 rounded text-sm focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
                />
                <textarea
                  value={item.description || ''}
                  onChange={(e) => updateItem(index, { description: e.target.value })}
                  placeholder="Item description (optional)"
                  rows={2}
                  className="w-full px-2 py-1.5 border border-neutral-200 rounded text-sm focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple resize-none"
                />
                <div className="flex gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    <LinkIcon className="h-4 w-4 text-neutral-400" />
                    <input
                      type="url"
                      value={item.helpLink || ''}
                      onChange={(e) => updateItem(index, { helpLink: e.target.value })}
                      placeholder="Help link URL"
                      className="w-48 px-2 py-1 border border-neutral-200 rounded text-xs focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-neutral-500">Due Day:</span>
                    <input
                      type="number"
                      value={item.dueDay || ''}
                      onChange={(e) => updateItem(index, { dueDay: e.target.value ? parseInt(e.target.value) : null })}
                      placeholder="Day #"
                      min="1"
                      max="90"
                      className="w-16 px-2 py-1 border border-neutral-200 rounded text-xs focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-neutral-500">Points:</span>
                    <input
                      type="number"
                      value={item.points || ''}
                      onChange={(e) => updateItem(index, { points: e.target.value ? parseInt(e.target.value) : 0 })}
                      placeholder="0"
                      min="0"
                      className="w-16 px-2 py-1 border border-neutral-200 rounded text-xs focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
                    />
                  </div>
                </div>
              </div>
              <button
                onClick={() => removeItem(index)}
                className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                title="Remove item"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={addItem}
        className="flex items-center gap-2 px-3 py-2 text-sm text-brand-purple hover:bg-brand-purple/5 rounded-lg transition-colors"
      >
        <PlusIcon className="h-4 w-4" />
        Add checklist item
      </button>

      {/* Summary */}
      {items.length > 0 && (
        <div className="text-xs text-neutral-500 pt-2 border-t">
          {items.length} item{items.length !== 1 ? 's' : ''} •
          {items.reduce((sum, i) => sum + (i.points || 0), 0)} total points
        </div>
      )}
    </div>
  );
}
