import React, { useState, useEffect, useCallback } from 'react';
import {
  Bars3Icon,
  XMarkIcon,
  ArrowPathIcon,
  EyeIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import FranchiseAcademyLayout from '../../../components/academy/layout/FranchiseAcademyLayout';
import AcademySidebar from '../../../components/academy/layout/AcademySidebar';
import ContentTree from '../../../components/academy/curriculum/ContentTree';
import ModuleEditor from '../../../components/academy/curriculum/ModuleEditor';
import AcademyRichTextEditor from '../../../components/academy/editor/AcademyRichTextEditor';
import { useToast } from '../../../hooks/useToast';
import ConfirmationModal from '../../../components/ConfirmationModal';

// Category options for documents
const CATEGORIES = [
  { value: 'operations', label: 'Operations' },
  { value: 'training', label: 'Training' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'hr', label: 'HR & Staffing' },
  { value: 'financial', label: 'Financial' },
  { value: 'general', label: 'General' },
];

export default function CurriculumEditorPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tree, setTree] = useState({ program: null, phases: [], resources: {} });
  const [selectedItem, setSelectedItem] = useState(null);
  const [editingData, setEditingData] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [documentSaving, setDocumentSaving] = useState(false);
  const [showPhaseModal, setShowPhaseModal] = useState(false);
  const [phaseSaving, setPhaseSaving] = useState(false);
  const [showModuleModal, setShowModuleModal] = useState(false);
  const [moduleSaving, setModuleSaving] = useState(false);
  const [addModulePhaseId, setAddModulePhaseId] = useState(null);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveItem, setMoveItem] = useState(null);
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });

  // Fetch tree data
  const fetchTree = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/academy/admin/tree');
      if (res.ok) {
        const data = await res.json();
        setTree(data);
      }
    } catch (error) {
      console.error('Error fetching tree:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  // Show toast notification with auto-dismiss
  const showToast = useCallback((type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Load selected item details
  useEffect(() => {
    if (!selectedItem) {
      setEditingData(null);
      return;
    }

    const loadItem = async () => {
      try {
        let url;
        if (selectedItem.type === 'module') {
          url = `/api/academy/modules/${selectedItem.id}`;
        } else if (selectedItem.type === 'resource') {
          url = `/api/academy/admin/documents/${selectedItem.id}`;
        } else if (selectedItem.type === 'phase') {
          url = `/api/academy/phases/${selectedItem.id}`;
        }

        if (url) {
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            setEditingData(data);
            setHasChanges(false);
          }
        }
      } catch (error) {
        console.error('Error loading item:', error);
      }
    };

    loadItem();
  }, [selectedItem]);

  // Handle selection with unsaved changes check
  const handleSelect = (item) => {
    if (hasChanges) {
      setConfirmState({
        isOpen: true,
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Discard them?',
        action: () => {
          setSelectedItem(item);
          setMobileTreeOpen(false);
        },
      });
      return;
    }
    setSelectedItem(item);
    setMobileTreeOpen(false);
  };

  // Handle data changes
  const handleDataChange = (updated) => {
    setEditingData(updated);
    setHasChanges(true);
  };

  // Save changes
  const handleSave = async () => {
    if (!editingData || !selectedItem) return;

    setSaving(true);
    try {
      let url, method;
      if (selectedItem.type === 'module') {
        url = `/api/academy/admin/modules/${selectedItem.id}`;
        method = 'PUT';
      } else if (selectedItem.type === 'resource') {
        url = `/api/academy/admin/documents/${selectedItem.id}`;
        method = 'PUT';
      } else if (selectedItem.type === 'phase') {
        url = `/api/academy/admin/phases/${selectedItem.id}`;
        method = 'PUT';
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingData),
      });

      if (res.ok) {
        setHasChanges(false);
        await fetchTree(); // Refresh tree
        showToast('success', 'Changes saved successfully');
      } else {
        showToast('error', 'Failed to save changes');
      }
    } catch (error) {
      console.error('Error saving:', error);
      showToast('error', 'Error saving changes');
    } finally {
      setSaving(false);
    }
  };

  // Handle file upload
  const handleUpload = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/academy/admin/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const { url } = await res.json();
        return url;
      }
    } catch (error) {
      console.error('Upload error:', error);
    }
    return null;
  };

  // Add new phase - show modal
  const handleAddPhase = () => {
    setShowPhaseModal(true);
  };

  // Save new phase from modal
  const handleSavePhase = async (phaseData) => {
    setPhaseSaving(true);
    try {
      const res = await fetch('/api/academy/admin/phases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          program_id: tree.program?.id,
          ...phaseData,
        }),
      });

      if (res.ok) {
        const newPhase = await res.json();
        await fetchTree();
        setShowPhaseModal(false);
        setSelectedItem({ id: newPhase.id, type: 'phase' });
      } else {
        const error = await res.json();
        toast.error(error.message || 'Failed to create phase');
      }
    } catch (error) {
      console.error('Error adding phase:', error);
      toast.error('Failed to create phase');
    } finally {
      setPhaseSaving(false);
    }
  };

  // Add new module - show modal
  const handleAddModule = (phaseId) => {
    setAddModulePhaseId(phaseId);
    setShowModuleModal(true);
  };

  // Save new module from modal
  const handleSaveModule = async (moduleData) => {
    setModuleSaving(true);
    try {
      const res = await fetch('/api/academy/admin/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase_id: addModulePhaseId,
          ...moduleData,
        }),
      });

      if (res.ok) {
        const newModule = await res.json();
        await fetchTree();
        setShowModuleModal(false);
        setSelectedItem({ id: newModule.id, type: 'module', phase_id: addModulePhaseId });
      } else {
        const error = await res.json();
        toast.error(error.message || 'Failed to create module');
      }
    } catch (error) {
      console.error('Error adding module:', error);
      toast.error('Failed to create module');
    } finally {
      setModuleSaving(false);
    }
  };

  // Add new resource - show modal
  const handleAddResource = () => {
    setShowDocumentModal(true);
  };

  // Save new document from modal
  const handleSaveDocument = async (docData) => {
    setDocumentSaving(true);
    try {
      const res = await fetch('/api/academy/admin/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docData),
      });

      if (res.ok) {
        const newDoc = await res.json();
        await fetchTree();
        setShowDocumentModal(false);
        setSelectedItem({ id: newDoc.id, type: 'resource', category: docData.category });
      } else {
        const error = await res.json();
        toast.error(error.message || 'Failed to create document');
      }
    } catch (error) {
      console.error('Error creating document:', error);
      toast.error('Failed to create document');
    } finally {
      setDocumentSaving(false);
    }
  };

  // Handle reorder via drag-and-drop
  const handleReorder = async ({ type, parentId, order }) => {
    try {
      const res = await fetch('/api/academy/admin/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, parent_id: parentId, order }),
      });
      if (res.ok) {
        await fetchTree();
      } else {
        console.error('Failed to reorder');
      }
    } catch (error) {
      console.error('Error reordering:', error);
    }
  };

  // Handle move to different phase/category
  const handleMove = async (itemToMove, newParentId) => {
    try {
      if (itemToMove.type === 'module') {
        // Move module to new phase
        const res = await fetch(`/api/academy/admin/modules/${itemToMove.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase_id: newParentId }),
        });
        if (res.ok) {
          await fetchTree();
          setShowMoveModal(false);
          setMoveItem(null);
        }
      } else if (itemToMove.type === 'resource') {
        // Move resource to new category
        const res = await fetch(`/api/academy/admin/documents/${itemToMove.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: newParentId }),
        });
        if (res.ok) {
          await fetchTree();
          setShowMoveModal(false);
          setMoveItem(null);
        }
      }
    } catch (error) {
      console.error('Error moving item:', error);
      toast.error('Failed to move item');
    }
  };

  // Handle menu actions
  const handleMenuAction = async (action, item) => {
    switch (action) {
      case 'duplicate':
        if (item.type === 'module' || selectedItem?.type === 'module') {
          const res = await fetch(`/api/academy/admin/modules/${item.id}/duplicate`, {
            method: 'POST',
          });
          if (res.ok) {
            await fetchTree();
          }
        }
        break;
      case 'move':
        setMoveItem(item);
        setShowMoveModal(true);
        break;
      case 'delete':
        setConfirmState({
          isOpen: true,
          title: 'Delete Item',
          message: `Delete "${item.title}"? This cannot be undone.`,
          action: async () => {
            const url = item.type === 'module'
              ? `/api/academy/admin/modules/${item.id}`
              : `/api/academy/admin/documents/${item.id}`;
            const res = await fetch(url, { method: 'DELETE' });
            if (res.ok) {
              await fetchTree();
              if (selectedItem?.id === item.id) {
                setSelectedItem(null);
              }
            }
          },
        });
        break;
      default:
        break;
    }
  };

  const sidebar = <AcademySidebar isMainBranch={true} />;

  return (
    <FranchiseAcademyLayout sidebar={sidebar}>
      <div className="h-[calc(100vh-64px)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileTreeOpen(true)}
              className="lg:hidden p-2 hover:bg-neutral-100 rounded-lg"
            >
              <Bars3Icon className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold text-neutral-900">Content Manager</h1>
            {hasChanges && (
              <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">
                Unsaved changes
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedItem && (
              <a
                href={selectedItem.type === 'module'
                  ? `/academy/module/${selectedItem.id}`
                  : `/academy/resources/${selectedItem.id}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg"
              >
                <EyeIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Preview</span>
              </a>
            )}
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-brand-purple hover:bg-brand-purple/90 disabled:bg-neutral-300 rounded-lg transition-colors"
            >
              {saving && <ArrowPathIcon className="h-4 w-4 animate-spin" />}
              Save
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Tree sidebar - desktop */}
          <div className="hidden lg:block w-80 border-r border-neutral-200 bg-neutral-50 flex-shrink-0">
            {loading ? (
              <div className="p-4 text-center text-neutral-500">Loading...</div>
            ) : (
              <ContentTree
                program={tree.program}
                phases={tree.phases}
                resources={tree.resources}
                selectedItem={selectedItem}
                onSelect={handleSelect}
                onAddPhase={handleAddPhase}
                onAddModule={handleAddModule}
                onAddResource={handleAddResource}
                onMenuAction={handleMenuAction}
                onReorder={handleReorder}
              />
            )}
          </div>

          {/* Mobile tree drawer */}
          {mobileTreeOpen && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div className="absolute inset-0 bg-black/50" onClick={() => setMobileTreeOpen(false)} />
              <div className="absolute left-0 top-0 bottom-0 w-80 bg-white shadow-xl">
                <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
                  <h2 className="font-semibold">Content</h2>
                  <button onClick={() => setMobileTreeOpen(false)} className="p-1 hover:bg-neutral-100 rounded">
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
                <ContentTree
                  program={tree.program}
                  phases={tree.phases}
                  resources={tree.resources}
                  selectedItem={selectedItem}
                  onSelect={handleSelect}
                  onAddPhase={handleAddPhase}
                  onAddModule={handleAddModule}
                  onAddResource={handleAddResource}
                  onMenuAction={handleMenuAction}
                  onReorder={handleReorder}
                />
              </div>
            </div>
          )}

          {/* Edit panel */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-6">
            {!selectedItem ? (
              <div className="h-full flex items-center justify-center text-neutral-500">
                <div className="text-center">
                  <p className="text-lg">Select an item to edit</p>
                  <p className="text-sm mt-1">Choose from the content tree on the left</p>
                </div>
              </div>
            ) : !editingData ? (
              <div className="h-full flex items-center justify-center">
                <ArrowPathIcon className="h-8 w-8 text-neutral-400 animate-spin" />
              </div>
            ) : selectedItem.type === 'module' ? (
              <ModuleEditor
                module={editingData}
                onChange={handleDataChange}
                onUpload={handleUpload}
              />
            ) : selectedItem.type === 'resource' ? (
              <div className="space-y-4 max-w-3xl">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={editingData.title || ''}
                    onChange={(e) => handleDataChange({ ...editingData, title: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Category</label>
                  <select
                    value={editingData.category || 'general'}
                    onChange={(e) => handleDataChange({ ...editingData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
                  >
                    <option value="operations">Operations</option>
                    <option value="training">Training</option>
                    <option value="marketing">Marketing</option>
                    <option value="hr">HR & Staffing</option>
                    <option value="financial">Financial</option>
                    <option value="general">General</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Content</label>
                  <AcademyRichTextEditor
                    content={editingData.content || ''}
                    onChange={(content) => handleDataChange({ ...editingData, content })}
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingData.is_published || false}
                    onChange={(e) => handleDataChange({ ...editingData, is_published: e.target.checked })}
                    className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
                  />
                  <span className="text-sm text-neutral-700">Published</span>
                </label>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Document Creation Modal */}
      {showDocumentModal && (
        <DocumentEditorModal
          onSave={handleSaveDocument}
          onClose={() => setShowDocumentModal(false)}
          saving={documentSaving}
        />
      )}

      {/* Phase Creation Modal */}
      {showPhaseModal && (
        <PhaseEditorModal
          onSave={handleSavePhase}
          onClose={() => setShowPhaseModal(false)}
          saving={phaseSaving}
          existingPhases={tree.phases}
        />
      )}

      {/* Module Creation Modal */}
      {showModuleModal && (
        <ModuleEditorModal
          onSave={handleSaveModule}
          onClose={() => setShowModuleModal(false)}
          saving={moduleSaving}
        />
      )}

      {/* Move To Modal */}
      {showMoveModal && moveItem && (
        <MoveToModal
          item={moveItem}
          phases={tree.phases}
          categories={CATEGORIES}
          onMove={handleMove}
          onClose={() => { setShowMoveModal(false); setMoveItem(null); }}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className="fixed bottom-4 right-4 z-50 transition-all duration-300 ease-out"
          style={{ animation: 'slideInUp 0.3s ease-out' }}
        >
          <div className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg ${
            toast.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {toast.type === 'success' && (
              <CheckCircleIcon className="h-5 w-5 text-emerald-500" />
            )}
            {toast.type === 'error' && (
              <XMarkIcon className="h-5 w-5 text-red-500" />
            )}
            <span className="font-medium">{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-2 text-current opacity-70 hover:opacity-100"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
          <style>{`
            @keyframes slideInUp {
              from { opacity: 0; transform: translateY(20px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      )}
      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
        onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
        title={confirmState.title}
        message={confirmState.message}
      />
    </FranchiseAcademyLayout>
  );
}

/**
 * Document Editor Modal for creating new documents
 */
function DocumentEditorModal({ onSave, onClose, saving }) {
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    category: 'general',
    content: '',
    is_published: true,
  });

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // Auto-generate slug from title
    if (field === 'title') {
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 100);
      setFormData((prev) => ({ ...prev, slug }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
          <h2 className="text-lg font-bold text-neutral-900">Create Document</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              required
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple"
            />
          </div>

          {/* Slug */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Slug
            </label>
            <input
              type="text"
              value={formData.slug}
              onChange={(e) => handleChange('slug', e.target.value)}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple
                       font-mono text-sm"
              placeholder="auto-generated-from-title"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Category *
            </label>
            <select
              value={formData.category}
              onChange={(e) => handleChange('category', e.target.value)}
              required
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple
                       bg-white"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Content - Rich Text Editor */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Content
            </label>
            <AcademyRichTextEditor
              content={formData.content}
              onChange={(html) => handleChange('content', html)}
              placeholder="Start writing your document..."
              minHeight="350px"
            />
            <p className="text-xs text-neutral-400 mt-1">
              Use the toolbar to format text, add headings, lists, links, and images
            </p>
          </div>

          {/* Published */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_published"
              checked={formData.is_published}
              onChange={(e) => handleChange('is_published', e.target.checked)}
              className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
            />
            <label htmlFor="is_published" className="text-sm text-neutral-700">
              Published (visible to franchisees)
            </label>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-neutral-200 bg-neutral-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-neutral-700 hover:bg-neutral-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !formData.title}
            className="px-4 py-2 bg-brand-purple text-white font-medium rounded-lg
                     hover:bg-brand-purple/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Phase Editor Modal for creating new phases
 */
function PhaseEditorModal({ onSave, onClose, saving, existingPhases }) {
  const nextPhaseNumber = existingPhases.length > 0
    ? Math.max(...existingPhases.map(p => p.phase_number || 0)) + 1
    : 1;

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    phase_number: nextPhaseNumber,
  });

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
          <h2 className="text-lg font-bold text-neutral-900">Create Phase</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Phase Number */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Phase Number
            </label>
            <input
              type="number"
              value={formData.phase_number}
              onChange={(e) => handleChange('phase_number', parseInt(e.target.value))}
              min={1}
              className="w-24 px-3 py-2 border border-neutral-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple"
            />
            <p className="text-xs text-neutral-400 mt-1">
              Auto-assigned as next available number
            </p>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              required
              placeholder="e.g., Getting Started"
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={3}
              placeholder="Brief description of what this phase covers..."
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple
                       resize-none"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-neutral-200 bg-neutral-50 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-neutral-700 hover:bg-neutral-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !formData.title}
            className="px-4 py-2 bg-brand-purple text-white font-medium rounded-lg
                     hover:bg-brand-purple/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create Phase'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Module Editor Modal for creating new modules
 */
function ModuleEditorModal({ onSave, onClose, saving }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    content_type: 'document',
    points_value: 10,
    is_required: false,
    is_gate: false,
  });

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const contentTypes = [
    { value: 'document', label: 'Document', description: 'Text content with rich formatting' },
    { value: 'video', label: 'Video', description: 'Video lesson with optional transcript' },
    { value: 'checklist', label: 'Checklist', description: 'Interactive task checklist' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
          <h2 className="text-lg font-bold text-neutral-900">Create Module</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              required
              placeholder="e.g., Welcome to Acme Operations"
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={2}
              placeholder="Brief description of this module..."
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple
                       resize-none"
            />
          </div>

          {/* Content Type */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Content Type
            </label>
            <div className="space-y-2">
              {contentTypes.map((type) => (
                <label
                  key={type.value}
                  className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    formData.content_type === type.value
                      ? 'border-brand-purple bg-brand-purple/5'
                      : 'border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="content_type"
                    value={type.value}
                    checked={formData.content_type === type.value}
                    onChange={(e) => handleChange('content_type', e.target.value)}
                    className="mt-0.5 text-brand-purple focus:ring-brand-purple"
                  />
                  <div>
                    <div className="text-sm font-medium text-neutral-900">{type.label}</div>
                    <div className="text-xs text-neutral-500">{type.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Points Value */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Points Value
            </label>
            <input
              type="number"
              value={formData.points_value}
              onChange={(e) => handleChange('points_value', parseInt(e.target.value))}
              min={0}
              className="w-24 px-3 py-2 border border-neutral-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple"
            />
            <p className="text-xs text-neutral-400 mt-1">
              Points awarded when franchisee completes this module
            </p>
          </div>

          {/* Checkboxes */}
          <div className="space-y-3 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_required}
                onChange={(e) => handleChange('is_required', e.target.checked)}
                className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
              />
              <div>
                <span className="text-sm font-medium text-neutral-700">Required</span>
                <p className="text-xs text-neutral-500">Franchisee must complete this module</p>
              </div>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_gate}
                onChange={(e) => handleChange('is_gate', e.target.checked)}
                className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
              />
              <div>
                <span className="text-sm font-medium text-neutral-700">Gate</span>
                <p className="text-xs text-neutral-500">Must complete to unlock next module</p>
              </div>
            </label>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-neutral-200 bg-neutral-50 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-neutral-700 hover:bg-neutral-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !formData.title}
            className="px-4 py-2 bg-brand-purple text-white font-medium rounded-lg
                     hover:bg-brand-purple/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create Module'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Move To Modal for moving modules between phases or resources between categories
 */
function MoveToModal({ item, phases, categories, onMove, onClose }) {
  const [selectedTarget, setSelectedTarget] = useState(null);

  const isModule = item.type === 'module';
  const targets = isModule
    ? phases.map(p => ({ id: p.id, label: `Phase ${p.phase_number}: ${p.title}` }))
    : categories.map(c => ({ id: c.value, label: c.label }));

  // Filter out current parent
  const availableTargets = targets.filter(t => t.id !== item.parentId);

  const handleMove = () => {
    if (selectedTarget) {
      onMove(item, selectedTarget);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
          <h2 className="text-lg font-bold text-neutral-900">Move "{item.title}"</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          <p className="text-sm text-neutral-600 mb-4">
            Select the {isModule ? 'phase' : 'category'} to move this {isModule ? 'module' : 'document'} to:
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {availableTargets.map((target) => (
              <label
                key={target.id}
                className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedTarget === target.id
                    ? 'border-brand-purple bg-brand-purple/5'
                    : 'border-neutral-200 hover:border-neutral-300'
                }`}
              >
                <input
                  type="radio"
                  name="target"
                  value={target.id}
                  checked={selectedTarget === target.id}
                  onChange={() => setSelectedTarget(target.id)}
                  className="text-brand-purple focus:ring-brand-purple"
                />
                <span className="text-sm font-medium text-neutral-900">{target.label}</span>
              </label>
            ))}
            {availableTargets.length === 0 && (
              <p className="text-sm text-neutral-500 text-center py-4">
                No other {isModule ? 'phases' : 'categories'} available
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-neutral-200 bg-neutral-50 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-neutral-700 hover:bg-neutral-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleMove}
            disabled={!selectedTarget}
            className="px-4 py-2 bg-brand-purple text-white font-medium rounded-lg
                     hover:bg-brand-purple/90 transition-colors disabled:opacity-50"
          >
            Move
          </button>
        </div>
      </div>
    </div>
  );
}
