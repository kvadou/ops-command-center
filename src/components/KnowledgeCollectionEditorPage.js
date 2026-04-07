import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeftIcon,
  FolderIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import ConfirmationModal from './ConfirmationModal';

// Collection icon options
const ICON_OPTIONS = [
  { id: 'folder', name: 'Folder', icon: '📁' },
  { id: 'rocket', name: 'Rocket', icon: '🚀' },
  { id: 'book', name: 'Book', icon: '📖' },
  { id: 'star', name: 'Star', icon: '⭐' },
  { id: 'chart', name: 'Chart', icon: '📊' },
  { id: 'users', name: 'Users', icon: '👥' },
  { id: 'graduation', name: 'Graduation', icon: '🎓' },
  { id: 'megaphone', name: 'Megaphone', icon: '📢' },
  { id: 'gear', name: 'Settings', icon: '⚙️' },
  { id: 'lightbulb', name: 'Lightbulb', icon: '💡' },
  { id: 'trophy', name: 'Trophy', icon: '🏆' },
  { id: 'chess', name: 'Chess', icon: '♟️' },
];

export default function KnowledgeCollectionEditorPage() {
  const { collectionId } = useParams();
  const navigate = useNavigate();
  const isEditing = !!collectionId;

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [slug, setSlug] = useState('');
  const [icon, setIcon] = useState('folder');
  const [displayOrder, setDisplayOrder] = useState(0);
  const [isPublished, setIsPublished] = useState(true);
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });

  useEffect(() => {
    if (isEditing) {
      fetchCollection();
    }
  }, [collectionId]);

  // Auto-generate slug from title
  useEffect(() => {
    if (!isEditing && title) {
      const generatedSlug = title
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
      setSlug(generatedSlug);
    }
  }, [title, isEditing]);

  const fetchCollection = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/knowledge/collections/${collectionId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch collection');
      }
      const data = await response.json();
      
      setTitle(data.collection.title || '');
      setDescription(data.collection.description || '');
      setSlug(data.collection.slug || '');
      setIcon(data.collection.icon || 'folder');
      setDisplayOrder(data.collection.display_order || 0);
      setIsPublished(data.collection.is_published !== false);
    } catch (error) {
      console.error('Error fetching collection:', error);
      setError('Failed to load collection');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (publish = isPublished) => {
    if (!title.trim()) {
      setError('Please enter a title');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const collectionData = {
        title,
        description,
        slug,
        icon,
        display_order: displayOrder,
        is_published: publish,
      };

      const url = isEditing
        ? `/api/knowledge/collections/${collectionId}`
        : '/api/knowledge/collections';

      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collectionData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save collection');
      }

      const data = await response.json();

      // Navigate to the collection page
      navigate(`/knowledge/collections/${data.collection?.slug || slug}`);
    } catch (error) {
      console.error('Error saving collection:', error);
      setError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!isEditing) return;

    setConfirmState({
      isOpen: true,
      action: async () => {
        try {
          setSaving(true);
          const response = await fetch(`/api/knowledge/collections/${collectionId}`, {
            method: 'DELETE',
          });

          if (!response.ok) {
            throw new Error('Failed to delete collection');
          }

          navigate('/knowledge/admin');
        } catch (error) {
          console.error('Error deleting collection:', error);
          setError('Failed to delete collection');
        } finally {
          setSaving(false);
        }
      },
      title: 'Delete Collection',
      message: 'Are you sure you want to delete this collection? This will also delete all articles in this collection. This action cannot be undone.',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-white to-brand-light/20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-neutral-200 rounded w-1/4 mb-8"></div>
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
              <div className="h-6 bg-neutral-200 rounded w-1/3 mb-4"></div>
              <div className="h-10 bg-neutral-200 rounded w-full mb-6"></div>
              <div className="h-6 bg-neutral-200 rounded w-1/3 mb-4"></div>
              <div className="h-24 bg-neutral-200 rounded w-full"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-white to-brand-light/20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              to={isEditing ? `/knowledge/collections/${slug || collectionId}` : '/knowledge/admin'}
              className="p-2 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">
                {isEditing ? 'Edit Collection' : 'New Collection'}
              </h1>
              <p className="text-sm text-neutral-500 mt-1">
                {isEditing ? 'Update collection details' : 'Create a new knowledge collection'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isEditing && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="px-4 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              >
                Delete
              </button>
            )}
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="px-4 py-2 text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save as Draft'}
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="px-4 py-2 text-white bg-brand-purple hover:bg-brand-purple/90 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <CheckIcon className="h-4 w-4" />
              {saving ? 'Publishing...' : 'Publish'}
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2">
            <XMarkIcon className="h-5 w-5" />
            {error}
          </div>
        )}

        {/* Form */}
        <div className="space-y-6">
          {/* Title */}
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Collection Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Getting Started, Marketing Resources"
              className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple transition-colors text-lg"
            />
          </div>

          {/* Description */}
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of what this collection contains..."
              rows={3}
              className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple transition-colors resize-none"
            />
          </div>

          {/* Slug */}
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              URL Slug
            </label>
            <div className="flex items-center gap-2">
              <span className="text-neutral-500">/knowledge/collections/</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="getting-started"
                className="flex-1 px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple transition-colors"
              />
            </div>
            <p className="text-xs text-neutral-500 mt-2">
              This will be the URL path for this collection. Use lowercase letters, numbers, and hyphens only.
            </p>
          </div>

          {/* Icon Selection */}
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
            <label className="block text-sm font-medium text-neutral-700 mb-4">
              Collection Icon
            </label>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
              {ICON_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setIcon(option.id)}
                  className={`p-3 text-2xl rounded-lg border-2 transition-all ${
                    icon === option.id
                      ? 'border-brand-purple bg-brand-purple/10'
                      : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                  }`}
                  title={option.name}
                >
                  {option.icon}
                </button>
              ))}
            </div>
          </div>

          {/* Display Order & Published Status */}
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Display Order
                </label>
                <input
                  type="number"
                  value={displayOrder}
                  onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
                  min="0"
                  className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple transition-colors"
                />
                <p className="text-xs text-neutral-500 mt-2">
                  Lower numbers appear first in the sidebar
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Visibility
                </label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={isPublished}
                      onChange={() => setIsPublished(true)}
                      className="w-4 h-4 text-brand-purple focus:ring-brand-purple"
                    />
                    <span className="text-sm text-neutral-700">Published</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={!isPublished}
                      onChange={() => setIsPublished(false)}
                      className="w-4 h-4 text-brand-purple focus:ring-brand-purple"
                    />
                    <span className="text-sm text-neutral-700">Draft</span>
                  </label>
                </div>
                <p className="text-xs text-neutral-500 mt-2">
                  Draft collections are only visible to admins
                </p>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
            <label className="block text-sm font-medium text-neutral-700 mb-4">
              Preview
            </label>
            <div className="flex items-start gap-4 p-4 bg-neutral-50 rounded-lg border border-neutral-200">
              <div className="p-3 bg-brand-purple/10 rounded-lg text-2xl">
                {ICON_OPTIONS.find(o => o.id === icon)?.icon || '📁'}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-neutral-900">
                  {title || 'Collection Title'}
                </h3>
                <p className="text-sm text-neutral-600 mt-1">
                  {description || 'Collection description will appear here...'}
                </p>
                <p className="text-xs text-neutral-400 mt-2">
                  /knowledge/collections/{slug || 'collection-slug'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState({ isOpen: false, action: null, title: '', message: '' })}
        onConfirm={() => {
          confirmState.action?.();
          setConfirmState({ isOpen: false, action: null, title: '', message: '' });
        }}
        title={confirmState.title}
        message={confirmState.message}
        confirmText="Delete"
        isDestructive={true}
      />
    </div>
  );
}



















