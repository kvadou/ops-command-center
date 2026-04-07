import { useState, useEffect } from 'react';
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  Bars3Icon,
  InformationCircleIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import ConfirmationModal from '../ConfirmationModal';
import { useToast } from '../../hooks/useToast';

/**
 * ChecklistEditor - Allows HQ admins to add/edit checklist items for an article
 * Used in KnowledgeArticleEditorPage
 */
export default function ChecklistEditor({ articleId, onChecklistChange }) {
  const toast = useToast();
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  
  // New item form state
  const [newItem, setNewItem] = useState({
    title: '',
    description: '',
    help_text: '',
    help_link: '',
    is_required: true,
    due_days: '',
    category: '',
  });

  const categories = [
    { value: '', label: 'No Category' },
    { value: 'legal', label: 'Legal & Compliance' },
    { value: 'financial', label: 'Financial Setup' },
    { value: 'operations', label: 'Operations' },
    { value: 'marketing', label: 'Marketing' },
    { value: 'training', label: 'Training' },
    { value: 'setup', label: 'Initial Setup' },
  ];

  useEffect(() => {
    if (articleId) {
      fetchChecklist();
    } else {
      setLoading(false);
    }
  }, [articleId]);

  const fetchChecklist = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/knowledge/articles/${articleId}/checklist`, {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setItems(data.checklist_items || []);
      }
    } catch (error) {
      console.error('Error fetching checklist:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async () => {
    if (!newItem.title.trim()) {
      toast.error('Please enter a title for the checklist item');
      return;
    }

    try {
      const response = await fetch(`/api/knowledge/articles/${articleId}/checklist`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...newItem,
          due_days: newItem.due_days ? parseInt(newItem.due_days) : null,
          display_order: items.length,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setItems([...items, data.checklist_item]);
        setNewItem({
          title: '',
          description: '',
          help_text: '',
          help_link: '',
          is_required: true,
          due_days: '',
          category: '',
        });
        setShowAddForm(false);
        onChecklistChange?.([...items, data.checklist_item]);
      } else {
        throw new Error('Failed to add item');
      }
    } catch (error) {
      console.error('Error adding checklist item:', error);
      toast.error('Failed to add checklist item');
    }
  };

  const handleUpdateItem = async (item) => {
    try {
      const response = await fetch(`/api/knowledge/checklist-items/${item.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...item,
          due_days: item.due_days ? parseInt(item.due_days) : null,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const updatedItems = items.map(i => i.id === item.id ? data.checklist_item : i);
        setItems(updatedItems);
        setEditingItem(null);
        onChecklistChange?.(updatedItems);
      } else {
        throw new Error('Failed to update item');
      }
    } catch (error) {
      console.error('Error updating checklist item:', error);
      toast.error('Failed to update checklist item');
    }
  };

  const handleDeleteItem = (itemId) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Checklist Item',
      message: 'Are you sure you want to delete this checklist item?',
      action: async () => {
        try {
          const response = await fetch(`/api/knowledge/checklist-items/${itemId}`, {
            method: 'DELETE',
            credentials: 'include',
          });

          if (response.ok) {
            const updatedItems = items.filter(i => i.id !== itemId);
            setItems(updatedItems);
            onChecklistChange?.(updatedItems);
          } else {
            throw new Error('Failed to delete item');
          }
        } catch (error) {
          console.error('Error deleting checklist item:', error);
          toast.error('Failed to delete checklist item');
        }
      }
    });
  };

  const handleDragStart = (e, index) => {
    setDraggedItem(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedItem === null || draggedItem === index) return;

    const newItems = [...items];
    const [removed] = newItems.splice(draggedItem, 1);
    newItems.splice(index, 0, removed);
    setItems(newItems);
    setDraggedItem(index);
  };

  const handleDragEnd = async () => {
    if (draggedItem === null) return;
    
    try {
      await fetch(`/api/knowledge/articles/${articleId}/checklist/reorder`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          item_ids: items.map(i => i.id),
        }),
      });
      onChecklistChange?.(items);
    } catch (error) {
      console.error('Error reordering items:', error);
    }
    
    setDraggedItem(null);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-neutral-200 p-6">
        <p className="text-neutral-500 text-center">Loading checklist...</p>
      </div>
    );
  }

  if (!articleId) {
    return (
      <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-6">
        <p className="text-yellow-700 text-center">
          Save the article first to add checklist items.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
      {/* Header */}
      <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="h-5 w-5 text-brand-purple" />
            <h3 className="font-semibold text-neutral-900">Onboarding Checklist</h3>
            <span className="text-sm text-neutral-500">({items.length} items)</span>
          </div>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors"
            >
              <PlusIcon className="h-4 w-4" />
              Add Item
            </button>
          )}
        </div>
        <p className="text-xs text-neutral-500 mt-1">
          Franchisees will complete these items during onboarding. Progress is tracked per-franchise.
        </p>
      </div>

      {/* Add Item Form */}
      {showAddForm && (
        <div className="p-4 bg-brand-purple/5 border-b border-neutral-200">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newItem.title}
                onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                placeholder="e.g., Form your LLC"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-brand-purple focus:border-brand-purple"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Description
              </label>
              <textarea
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                placeholder="Brief description of what needs to be done..."
                rows={2}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-brand-purple focus:border-brand-purple"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Category
                </label>
                <select
                  value={newItem.category}
                  onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-brand-purple focus:border-brand-purple"
                >
                  {categories.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Due (days from start)
                </label>
                <input
                  type="number"
                  value={newItem.due_days}
                  onChange={(e) => setNewItem({ ...newItem, due_days: e.target.value })}
                  placeholder="e.g., 7"
                  min="1"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-brand-purple focus:border-brand-purple"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Help Text
              </label>
              <input
                type="text"
                value={newItem.help_text}
                onChange={(e) => setNewItem({ ...newItem, help_text: e.target.value })}
                placeholder="Additional guidance for completing this step..."
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-brand-purple focus:border-brand-purple"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Help Link
              </label>
              <input
                type="url"
                value={newItem.help_link}
                onChange={(e) => setNewItem({ ...newItem, help_link: e.target.value })}
                placeholder="https://..."
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-brand-purple focus:border-brand-purple"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_required"
                checked={newItem.is_required}
                onChange={(e) => setNewItem({ ...newItem, is_required: e.target.checked })}
                className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
              />
              <label htmlFor="is_required" className="text-sm text-neutral-700">
                Required item (must be completed)
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewItem({
                    title: '',
                    description: '',
                    help_text: '',
                    help_link: '',
                    is_required: true,
                    due_days: '',
                    category: '',
                  });
                }}
                className="px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddItem}
                className="px-4 py-2 text-sm bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors"
              >
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Items List */}
      <div className="divide-y divide-neutral-100">
        {items.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            <CheckCircleIcon className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
            <p>No checklist items yet.</p>
            <p className="text-sm">Add items that franchisees need to complete during onboarding.</p>
          </div>
        ) : (
          items.map((item, index) => (
            <div
              key={item.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`p-4 hover:bg-neutral-50 transition-colors ${
                draggedItem === index ? 'bg-brand-purple/10' : ''
              }`}
            >
              {editingItem?.id === item.id ? (
                // Edit Form
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editingItem.title}
                    onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-brand-purple focus:border-brand-purple"
                  />
                  <textarea
                    value={editingItem.description || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-brand-purple focus:border-brand-purple"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingItem(null)}
                      className="p-2 text-neutral-500 hover:bg-neutral-100 rounded"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleUpdateItem(editingItem)}
                      className="p-2 text-green-600 hover:bg-green-50 rounded"
                    >
                      <CheckIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                // Display
                <div className="flex items-start gap-3">
                  <div className="cursor-move text-neutral-400 hover:text-neutral-600 mt-1">
                    <Bars3Icon className="h-5 w-5" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-neutral-900">{item.title}</span>
                      {item.is_required && (
                        <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">
                          Required
                        </span>
                      )}
                      {item.category && (
                        <span className="text-xs px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded">
                          {categories.find(c => c.value === item.category)?.label || item.category}
                        </span>
                      )}
                      {item.due_days && (
                        <span className="text-xs text-neutral-500">
                          Due: Day {item.due_days}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-sm text-neutral-600 mt-1">{item.description}</p>
                    )}
                    {item.help_text && (
                      <p className="text-xs text-neutral-500 mt-1 flex items-center gap-1">
                        <InformationCircleIcon className="h-3 w-3" />
                        {item.help_text}
                      </p>
                    )}
                    {item.help_link && (
                      <a
                        href={item.help_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-brand-purple hover:underline mt-1 flex items-center gap-1"
                      >
                        <LinkIcon className="h-3 w-3" />
                        Resource Link
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingItem({ ...item })}
                      className="p-2 text-neutral-400 hover:text-brand-purple hover:bg-brand-purple/10 rounded transition-colors"
                      title="Edit"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
        onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
        title={confirmState.title}
        message={confirmState.message}
      />
    </div>
  );
}

