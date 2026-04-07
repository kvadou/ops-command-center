import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  DocumentTextIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  FolderIcon,
  EyeIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import FranchiseAcademyLayout from '../../../components/academy/layout/FranchiseAcademyLayout';
import AcademySidebar from '../../../components/academy/layout/AcademySidebar';
import AcademyRichTextEditor from '../../../components/academy/editor/AcademyRichTextEditor';
import { useToast } from '../../../hooks/useToast';
import ConfirmationModal from '../../../components/ConfirmationModal';

// Category options
const CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'operations', label: 'Operations' },
  { value: 'training', label: 'Training' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'hr', label: 'HR & Staffing' },
  { value: 'financial', label: 'Financial' },
  { value: 'creative', label: 'Creative Assets' },
  { value: 'general', label: 'General' },
  { value: 'internal', label: 'Internal' },
];

/**
 * Content Manager - Admin interface for managing academy documents
 *
 * Features:
 * - List all documents with search/filter
 * - Create/edit documents
 * - Toggle publish status
 * - Delete documents
 */
export default function ContentManagerPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });

  useEffect(() => {
    fetchDocuments();
  }, [category, search]);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (category !== 'all') params.append('category', category);
      if (search) params.append('search', search);
      params.append('include_unpublished', 'true');
      params.append('limit', '100');

      const res = await fetch(`/api/academy/admin/documents?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    setSelectedDoc({
      id: null,
      title: '',
      slug: '',
      category: 'general',
      content: '',
      is_published: true,
    });
    setShowEditor(true);
  };

  const handleEdit = async (doc) => {
    // Fetch full document including content
    try {
      const res = await fetch(`/api/academy/admin/documents/${doc.id}`);
      if (res.ok) {
        const fullDoc = await res.json();
        setSelectedDoc(fullDoc);
        setShowEditor(true);
      } else {
        console.error('Failed to load document');
        toast.error('Failed to load document for editing');
      }
    } catch (error) {
      console.error('Error loading document:', error);
      toast.error('Failed to load document for editing');
    }
  };

  const handleSave = async (docData) => {
    setSaving(true);
    try {
      const method = docData.id ? 'PUT' : 'POST';
      const url = docData.id
        ? `/api/academy/admin/documents/${docData.id}`
        : '/api/academy/admin/documents';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docData),
      });

      if (res.ok) {
        setShowEditor(false);
        setSelectedDoc(null);
        fetchDocuments();
      } else {
        const error = await res.json();
        toast.error(error.message || 'Failed to save document');
      }
    } catch (error) {
      console.error('Error saving document:', error);
      toast.error('Failed to save document');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async (doc) => {
    try {
      const res = await fetch(`/api/academy/admin/documents/${doc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...doc, is_published: !doc.is_published }),
      });

      if (res.ok) {
        fetchDocuments();
      }
    } catch (error) {
      console.error('Error toggling publish:', error);
    }
  };

  const handleDelete = (doc) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Document',
      message: `Are you sure you want to delete "${doc.title}"?`,
      action: async () => {
        try {
          const res = await fetch(`/api/academy/admin/documents/${doc.id}`, {
            method: 'DELETE',
          });

          if (res.ok) {
            fetchDocuments();
          }
        } catch (error) {
          console.error('Error deleting document:', error);
        }
      },
    });
  };

  return (
    <FranchiseAcademyLayout
      sidebar={<AcademySidebar isMainBranch={true} />}
      progress={100}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Content Manager</h1>
            <p className="text-neutral-600 mt-1">
              Manage academy documents and resources
            </p>
          </div>

          <button
            onClick={handleCreateNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-navy text-white
                     font-medium rounded-lg hover:bg-primary-600 transition-colors"
          >
            <PlusIcon className="h-4 w-4" />
            Add Document
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents..."
              className="w-full pl-10 pr-4 py-2 border border-neutral-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-brand-navy/30 focus:border-brand-navy"
            />
          </div>

          {/* Category Filter */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-4 py-2 border border-neutral-200 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-brand-navy/30 focus:border-brand-navy
                     bg-white"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        {/* Documents Table */}
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-brand-navy/20 border-t-brand-navy" />
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12">
              <FolderIcon className="h-12 w-12 mx-auto text-neutral-300 mb-4" />
              <p className="text-neutral-600">No documents found</p>
              <button
                onClick={handleCreateNew}
                className="mt-4 text-brand-navy hover:underline text-sm"
              >
                Create your first document
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">
                      Title
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">
                      Category
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">
                      Updated
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <DocumentTextIcon className="h-5 w-5 text-neutral-400" />
                          <div>
                            <p className="font-medium text-neutral-900 line-clamp-1">
                              {doc.title}
                            </p>
                            <p className="text-xs text-neutral-400">{doc.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-neutral-100 text-neutral-600 text-xs rounded-full capitalize">
                          {doc.category}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleTogglePublish(doc)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium
                            ${doc.is_published
                              ? 'bg-green-100 text-green-700'
                              : 'bg-neutral-100 text-neutral-500'
                            }`}
                        >
                          {doc.is_published ? (
                            <>
                              <CheckCircleIcon className="h-3.5 w-3.5" />
                              Published
                            </>
                          ) : (
                            <>
                              <XCircleIcon className="h-3.5 w-3.5" />
                              Draft
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-500">
                        {new Date(doc.updated_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleEdit(doc)}
                            className="p-2 text-neutral-500 hover:text-brand-navy hover:bg-neutral-100 rounded-lg"
                            title="Edit"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(doc)}
                            className="p-2 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                            title="Delete"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Document Editor Modal */}
      {showEditor && selectedDoc && (
        <DocumentEditor
          document={selectedDoc}
          onSave={handleSave}
          onClose={() => {
            setShowEditor(false);
            setSelectedDoc(null);
          }}
          saving={saving}
        />
      )}

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
        onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
        title={confirmState.title}
        message={confirmState.message}
        isDestructive
      />
    </FranchiseAcademyLayout>
  );
}

/**
 * Document Editor Modal
 */
function DocumentEditor({ document, onSave, onClose, saving }) {
  const [formData, setFormData] = useState({
    id: document.id,
    title: document.title || '',
    slug: document.slug || '',
    category: document.category || 'general',
    content: document.content || '',
    is_published: document.is_published ?? true,
  });

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // Auto-generate slug from title if creating new
    if (field === 'title' && !document.id) {
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
          <h2 className="text-lg font-bold text-neutral-900">
            {document.id ? 'Edit Document' : 'Create Document'}
          </h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600"
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
                       focus:outline-none focus:ring-2 focus:ring-brand-navy/30 focus:border-brand-navy"
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
                       focus:outline-none focus:ring-2 focus:ring-brand-navy/30 focus:border-brand-navy
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
                       focus:outline-none focus:ring-2 focus:ring-brand-navy/30 focus:border-brand-navy
                       bg-white"
            >
              {CATEGORIES.filter((c) => c.value !== 'all').map((cat) => (
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
              className="rounded border-neutral-300 text-brand-navy focus:ring-brand-navy"
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
            className="px-4 py-2 bg-brand-navy text-white font-medium rounded-lg
                     hover:bg-primary-600 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : document.id ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
