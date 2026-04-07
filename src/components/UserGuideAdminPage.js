import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import ReactQuillWrapper from "./ReactQuillWrapper";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ChevronRightIcon,
  BookOpenIcon,
  DocumentTextIcon,
  PlayIcon,
  PhotoIcon,
  CodeBracketIcon,
  XMarkIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import ConfirmationModal from "./ConfirmationModal";
import { useToast } from "../hooks/useToast";

/**
 * UserGuideAdminPage - Admin interface for managing user guide content
 * Features drag-and-drop reordering, rich text editing, and video support
 */

// Sortable Collection Item
function SortableCollectionItem({ collection, onEdit, onDelete, onSelect }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: collection.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 hover:shadow-md transition-all"
    >
      <div className="flex items-center justify-between">
        <div
          {...attributes}
          {...listeners}
          className="flex items-center gap-3 flex-1 cursor-grab active:cursor-grabbing"
        >
          <div className="text-neutral-400">⋮⋮</div>
          <BookOpenIcon className="h-5 w-5 text-brand-purple" />
          <div className="flex-1">
            <h3 className="font-semibold text-neutral-900">{collection.title}</h3>
            {collection.description && (
              <p className="text-sm text-neutral-600 line-clamp-1">{collection.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSelect(collection)}
            className="p-2 text-neutral-500 hover:text-brand-purple hover:bg-brand-light/30 rounded-lg transition-colors"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => onEdit(collection)}
            className="p-2 text-neutral-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <PencilIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => onDelete(collection.id)}
            className="p-2 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Sortable Article Item
function SortableArticleItem({ article, onEdit, onDelete, onSelect }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: article.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 hover:shadow-md transition-all"
    >
      <div className="flex items-center justify-between">
        <div
          {...attributes}
          {...listeners}
          className="flex items-center gap-3 flex-1 cursor-grab active:cursor-grabbing"
        >
          <div className="text-neutral-400">⋮⋮</div>
          <DocumentTextIcon className="h-5 w-5 text-brand-purple" />
          <div className="flex-1">
            <h3 className="font-semibold text-neutral-900">{article.title}</h3>
            {article.description && (
              <p className="text-sm text-neutral-600 line-clamp-1">{article.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSelect(article)}
            className="p-2 text-neutral-500 hover:text-brand-purple hover:bg-brand-light/30 rounded-lg transition-colors"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => onEdit(article)}
            className="p-2 text-neutral-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <PencilIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => onDelete(article.id)}
            className="p-2 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Sortable Section Item
function SortableSectionItem({ section, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getSectionIcon = () => {
    switch (section.section_type) {
      case "video":
        return <PlayIcon className="h-5 w-5 text-red-500" />;
      case "image":
        return <PhotoIcon className="h-5 w-5 text-green-500" />;
      case "code":
        return <CodeBracketIcon className="h-5 w-5 text-purple-500" />;
      default:
        return <DocumentTextIcon className="h-5 w-5 text-blue-500" />;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 hover:shadow-md transition-all"
    >
      <div className="flex items-center justify-between">
        <div
          {...attributes}
          {...listeners}
          className="flex items-center gap-3 flex-1 cursor-grab active:cursor-grabbing"
        >
          <div className="text-neutral-400">⋮⋮</div>
          {getSectionIcon()}
          <div className="flex-1">
            <h3 className="font-semibold text-neutral-900">
              {section.title || `Section (${section.section_type})`}
            </h3>
            {section.section_type === "video" && section.video_url && (
              <p className="text-sm text-neutral-600 truncate">{section.video_url}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(section)}
            className="p-2 text-neutral-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <PencilIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => onDelete(section.id)}
            className="p-2 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Collection/Article/Section Form Modal
function ItemFormModal({ isOpen, onClose, item, type, onSave, collectionId }) {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    icon: "",
    slug: "",
    is_published: true,
    section_type: "text",
    content: "",
    video_url: "",
    video_provider: "loom",
    image_url: "",
    code_content: "",
    code_language: "javascript",
  });

  useEffect(() => {
    if (item) {
      setFormData({
        title: item.title || "",
        description: item.description || "",
        icon: item.icon || "",
        slug: item.slug || "",
        is_published: item.is_published !== false,
        section_type: item.section_type || "text",
        content: item.content || "",
        video_url: item.video_url || "",
        video_provider: item.video_provider || "loom",
        image_url: item.image_url || "",
        code_content: item.code_content || "",
        code_language: item.code_language || "javascript",
      });
    } else {
      setFormData({
        title: "",
        description: "",
        icon: "",
        slug: "",
        is_published: true,
        section_type: "text",
        content: "",
        video_url: "",
        video_provider: "loom",
        image_url: "",
        code_content: "",
        code_language: "javascript",
      });
    }
  }, [item, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onSave(formData);
    onClose();
  };

  const generateSlug = (title) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-neutral-900">
            {item ? `Edit ${type}` : `Create New ${type}`}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">Title *</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => {
                setFormData({ ...formData, title: e.target.value });
                if (type === "Article" && !item) {
                  setFormData((prev) => ({
                    ...prev,
                    slug: generateSlug(e.target.value),
                  }));
                }
              }}
              className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
            />
          </div>

          {/* Slug (for articles only) */}
          {type === "Article" && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Slug *</label>
              <input
                type="text"
                required
                value={formData.slug}
                onChange={(e) =>
                  setFormData({ ...formData, slug: generateSlug(e.target.value) })
                }
                className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
              />
              <p className="mt-1 text-sm text-neutral-500">
                URL-friendly identifier (auto-generated from title)
              </p>
            </div>
          )}

          {/* Icon (for collections only) */}
          {type === "Collection" && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Icon Name</label>
              <input
                type="text"
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                placeholder="e.g., BookOpenIcon"
                className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
              />
            </div>
          )}

          {/* Section Type (for sections only) */}
          {type === "Section" && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Section Type *</label>
              <select
                value={formData.section_type}
                onChange={(e) => setFormData({ ...formData, section_type: e.target.value })}
                className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
              >
                <option value="text">Text</option>
                <option value="video">Video</option>
                <option value="image">Image</option>
                <option value="code">Code</option>
              </select>
            </div>
          )}

          {/* Content based on section type */}
          {type === "Section" && formData.section_type === "text" && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Content</label>
              <ReactQuillWrapper
                value={formData.content}
                onChange={(value) => setFormData({ ...formData, content: value })}
                modules={{
                  toolbar: [
                    [{ header: [1, 2, 3, false] }],
                    ["bold", "italic", "underline", "strike"],
                    [{ list: "ordered" }, { list: "bullet" }],
                    ["link", "image"],
                    ["clean"],
                  ],
                }}
                className="bg-white"
              />
            </div>
          )}

          {type === "Section" && formData.section_type === "video" && (
            <>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Video URL *</label>
                <input
                  type="url"
                  required
                  value={formData.video_url}
                  onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                  placeholder="https://www.loom.com/share/..."
                  className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Video Provider</label>
                <select
                  value={formData.video_provider}
                  onChange={(e) => setFormData({ ...formData, video_provider: e.target.value })}
                  className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                >
                  <option value="loom">Loom</option>
                  <option value="youtube">YouTube</option>
                  <option value="vimeo">Vimeo</option>
                </select>
              </div>
            </>
          )}

          {type === "Section" && formData.section_type === "image" && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Image URL *</label>
              <input
                type="url"
                required
                value={formData.image_url}
                onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                placeholder="https://..."
                className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
              />
            </div>
          )}

          {type === "Section" && formData.section_type === "code" && (
            <>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Code Language</label>
                <select
                  value={formData.code_language}
                  onChange={(e) => setFormData({ ...formData, code_language: e.target.value })}
                  className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                >
                  <option value="javascript">JavaScript</option>
                  <option value="python">Python</option>
                  <option value="sql">SQL</option>
                  <option value="bash">Bash</option>
                  <option value="text">Plain Text</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Code Content *</label>
                <textarea
                  required
                  value={formData.code_content}
                  onChange={(e) => setFormData({ ...formData, code_content: e.target.value })}
                  rows={10}
                  className="w-full px-4 py-2 border border-neutral-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                />
              </div>
            </>
          )}

          {/* Published Toggle */}
          {type !== "Section" && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_published"
                checked={formData.is_published}
                onChange={(e) =>
                  setFormData({ ...formData, is_published: e.target.checked })
                }
                className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
              />
              <label htmlFor="is_published" className="text-sm font-medium text-neutral-700">
                Published
              </label>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-brand-purple hover:bg-brand-navy rounded-lg transition-colors flex items-center gap-2"
            >
              <CheckIcon className="h-5 w-5" />
              {item ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UserGuideAdminPage() {
  const { collectionId, articleId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formModal, setFormModal] = useState({ isOpen: false, type: null, item: null });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchCollections();
  }, []);

  useEffect(() => {
    if (collectionId) {
      fetchCollection(collectionId);
    }
  }, [collectionId]);

  useEffect(() => {
    if (articleId) {
      fetchArticle(articleId);
    }
  }, [articleId]);

  const fetchCollections = async () => {
    try {
      const userData = localStorage.getItem("user");
      const headers = {
        "Content-Type": "application/json",
        "x-user-data": userData || "{}",
      };

      const response = await fetch("/api/user-guide/collections", { credentials: 'include', headers });
      const data = await response.json();
      setCollections(data.collections || []);
    } catch (error) {
      console.error("Error fetching collections:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCollection = async (id) => {
    try {
      const response = await fetch(`/api/user-guide/collections/${id}`, { credentials: 'include' });
      const data = await response.json();
      setSelectedCollection({ ...data.collection, articles: data.articles || [] });
    } catch (error) {
      console.error("Error fetching collection:", error);
    }
  };

  const fetchArticle = async (id) => {
    try {
      const response = await fetch(`/api/user-guide/articles/${id}`, { credentials: 'include' });
      const data = await response.json();
      setSelectedArticle(data.article);
      setSections(data.sections || []);
    } catch (error) {
      console.error("Error fetching article:", error);
    }
  };

  const handleDragEnd = async (event, type) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const userData = localStorage.getItem("user");
    const headers = {
      "Content-Type": "application/json",
      "x-user-data": userData || "{}",
    };

    if (type === "collections") {
      const oldIndex = collections.findIndex((item) => item.id === active.id);
      const newIndex = collections.findIndex((item) => item.id === over.id);
      const newCollections = arrayMove(collections, oldIndex, newIndex);
      setCollections(newCollections);

      const reorderData = newCollections.map((item, index) => ({
        id: item.id,
        order_index: index,
      }));

      await fetch("/api/user-guide/collections/reorder", {
        method: "PUT",
        credentials: 'include',
        headers,
        body: JSON.stringify({ collections: reorderData }),
      });
    } else if (type === "articles" && selectedCollection) {
      const oldIndex = selectedCollection.articles.findIndex((item) => item.id === active.id);
      const newIndex = selectedCollection.articles.findIndex((item) => item.id === over.id);
      const newArticles = arrayMove(selectedCollection.articles, oldIndex, newIndex);
      setSelectedCollection({ ...selectedCollection, articles: newArticles });

      const reorderData = newArticles.map((item, index) => ({
        id: item.id,
        order_index: index,
      }));

      await fetch("/api/user-guide/articles/reorder", {
        method: "PUT",
        credentials: 'include',
        headers,
        body: JSON.stringify({ articles: reorderData }),
      });
    } else if (type === "sections" && selectedArticle) {
      const oldIndex = sections.findIndex((item) => item.id === active.id);
      const newIndex = sections.findIndex((item) => item.id === over.id);
      const newSections = arrayMove(sections, oldIndex, newIndex);
      setSections(newSections);

      const reorderData = newSections.map((item, index) => ({
        id: item.id,
        order_index: index,
      }));

      await fetch("/api/user-guide/sections/reorder", {
        method: "PUT",
        credentials: 'include',
        headers,
        body: JSON.stringify({ sections: reorderData }),
      });
    }
  };

  const handleSave = async (formData, type) => {
    const userData = localStorage.getItem("user");
    const headers = {
      "Content-Type": "application/json",
      "x-user-data": userData || "{}",
    };

    try {
      if (type === "Collection") {
        if (formModal.item) {
          await fetch(`/api/user-guide/collections/${formModal.item.id}`, {
            method: "PUT",
            credentials: 'include',
            headers,
            body: JSON.stringify(formData),
          });
        } else {
          const maxOrder = collections.length > 0
            ? Math.max(...collections.map((c) => c.order_index || 0))
            : -1;
          await fetch("/api/user-guide/collections", {
            method: "POST",
            credentials: 'include',
            headers,
            body: JSON.stringify({ ...formData, order_index: maxOrder + 1 }),
          });
        }
        await fetchCollections();
      } else if (type === "Article") {
        if (formModal.item) {
          await fetch(`/api/user-guide/articles/${formModal.item.id}`, {
            method: "PUT",
            credentials: 'include',
            headers,
            body: JSON.stringify(formData),
          });
        } else {
          const maxOrder =
            selectedCollection?.articles?.length > 0
              ? Math.max(...selectedCollection.articles.map((a) => a.order_index || 0))
              : -1;
          await fetch("/api/user-guide/articles", {
            method: "POST",
            credentials: 'include',
            headers,
            body: JSON.stringify({
              ...formData,
              collection_id: selectedCollection.id,
              order_index: maxOrder + 1,
            }),
          });
        }
        if (selectedCollection) {
          await fetchCollection(selectedCollection.id);
        }
      } else if (type === "Section") {
        if (formModal.item) {
          await fetch(`/api/user-guide/sections/${formModal.item.id}`, {
            method: "PUT",
            credentials: 'include',
            headers,
            body: JSON.stringify(formData),
          });
        } else {
          const maxOrder =
            sections.length > 0
              ? Math.max(...sections.map((s) => s.order_index || 0))
              : -1;
          await fetch("/api/user-guide/sections", {
            method: "POST",
            credentials: 'include',
            headers,
            body: JSON.stringify({
              ...formData,
              article_id: selectedArticle.id,
              order_index: maxOrder + 1,
            }),
          });
        }
        if (selectedArticle) {
          await fetchArticle(selectedArticle.id);
        }
      }
    } catch (error) {
      console.error("Error saving:", error);
      toast.error("Failed to save. Please try again.");
    }
  };

  const handleDelete = (id, type) => {
    setConfirmState({
      isOpen: true,
      title: `Delete ${type}`,
      message: `Are you sure you want to delete this ${type.toLowerCase()}?`,
      action: async () => {
        const userData = localStorage.getItem("user");
        const headers = {
          "Content-Type": "application/json",
          "x-user-data": userData || "{}",
        };

        try {
          if (type === "Collection") {
            await fetch(`/api/user-guide/collections/${id}`, { method: "DELETE", credentials: 'include', headers });
            await fetchCollections();
            setSelectedCollection(null);
          } else if (type === "Article") {
            await fetch(`/api/user-guide/articles/${id}`, { method: "DELETE", credentials: 'include', headers });
            if (selectedCollection) {
              await fetchCollection(selectedCollection.id);
            }
            setSelectedArticle(null);
            setSections([]);
          } else if (type === "Section") {
            await fetch(`/api/user-guide/sections/${id}`, { method: "DELETE", credentials: 'include', headers });
            if (selectedArticle) {
              await fetchArticle(selectedArticle.id);
            }
          }
        } catch (error) {
          console.error("Error deleting:", error);
          toast.error("Failed to delete. Please try again.");
        }
      }
    });
  };

  if (loading) {
    return (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple"></div>
        </div>
    );
  }

  return (
    <>
      <div className="max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">User Guide Admin</h1>
            <p className="text-neutral-600 mt-1">Manage your user guide content</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/user-guide"
              className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
            >
              View Guide
            </Link>
            {!selectedCollection && (
              <button
                onClick={() =>
                  setFormModal({ isOpen: true, type: "Collection", item: null })
                }
                className="px-4 py-2 text-sm font-medium text-white bg-brand-purple hover:bg-brand-navy rounded-lg transition-colors flex items-center gap-2"
              >
                <PlusIcon className="h-5 w-5" />
                New Collection
              </button>
            )}
            {selectedCollection && !selectedArticle && (
              <button
                onClick={() =>
                  setFormModal({ isOpen: true, type: "Article", item: null })
                }
                className="px-4 py-2 text-sm font-medium text-white bg-brand-purple hover:bg-brand-navy rounded-lg transition-colors flex items-center gap-2"
              >
                <PlusIcon className="h-5 w-5" />
                New Article
              </button>
            )}
            {selectedArticle && (
              <button
                onClick={() =>
                  setFormModal({ isOpen: true, type: "Section", item: null })
                }
                className="px-4 py-2 text-sm font-medium text-white bg-brand-purple hover:bg-brand-navy rounded-lg transition-colors flex items-center gap-2"
              >
                <PlusIcon className="h-5 w-5" />
                New Section
              </button>
            )}
          </div>
        </div>

        {/* Breadcrumbs */}
        {(selectedCollection || selectedArticle) && (
          <nav className="mb-6 text-sm text-neutral-500 flex items-center gap-2">
            <button
              onClick={() => {
                setSelectedCollection(null);
                setSelectedArticle(null);
                setSections([]);
                navigate("/user-guide/admin");
              }}
              className="hover:text-brand-purple"
            >
              Collections
            </button>
            {selectedCollection && (
              <>
                <ChevronRightIcon className="h-4 w-4" />
                <button
                  onClick={() => {
                    setSelectedArticle(null);
                    setSections([]);
                    navigate(`/user-guide/admin/collections/${selectedCollection.id}`);
                  }}
                  className="hover:text-brand-purple"
                >
                  {selectedCollection.title}
                </button>
              </>
            )}
            {selectedArticle && (
              <>
                <ChevronRightIcon className="h-4 w-4" />
                <span className="text-neutral-900">{selectedArticle.title}</span>
              </>
            )}
          </nav>
        )}

        {/* Collections View */}
        {!selectedCollection && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => handleDragEnd(e, "collections")}
          >
            <SortableContext
              items={collections.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {collections.map((collection) => (
                  <SortableCollectionItem
                    key={collection.id}
                    collection={collection}
                    onEdit={(item) =>
                      setFormModal({ isOpen: true, type: "Collection", item })
                    }
                    onDelete={(id) => handleDelete(id, "Collection")}
                    onSelect={(item) => {
                      setSelectedCollection(item);
                      navigate(`/user-guide/admin/collections/${item.id}`);
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Articles View */}
        {selectedCollection && !selectedArticle && (
          <div>
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 mb-6">
              <h2 className="text-xl font-bold text-neutral-900 mb-2">
                {selectedCollection.title}
              </h2>
              {selectedCollection.description && (
                <p className="text-neutral-600">{selectedCollection.description}</p>
              )}
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => handleDragEnd(e, "articles")}
            >
              <SortableContext
                items={selectedCollection.articles?.map((a) => a.id) || []}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-4">
                  {selectedCollection.articles?.map((article) => (
                    <SortableArticleItem
                      key={article.id}
                      article={article}
                      onEdit={(item) =>
                        setFormModal({ isOpen: true, type: "Article", item })
                      }
                      onDelete={(id) => handleDelete(id, "Article")}
                      onSelect={(item) => {
                        setSelectedArticle(item);
                        navigate(
                          `/user-guide/admin/collections/${selectedCollection.id}/articles/${item.id}`
                        );
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}

        {/* Sections View */}
        {selectedArticle && (
          <div>
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 mb-6">
              <h2 className="text-xl font-bold text-neutral-900 mb-2">
                {selectedArticle.title}
              </h2>
              {selectedArticle.description && (
                <p className="text-neutral-600">{selectedArticle.description}</p>
              )}
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => handleDragEnd(e, "sections")}
            >
              <SortableContext
                items={sections.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-4">
                  {sections.map((section) => (
                    <SortableSectionItem
                      key={section.id}
                      section={section}
                      onEdit={(item) =>
                        setFormModal({ isOpen: true, type: "Section", item })
                      }
                      onDelete={(id) => handleDelete(id, "Section")}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}

        {/* Form Modal */}
        <ItemFormModal
          isOpen={formModal.isOpen}
          onClose={() => setFormModal({ isOpen: false, type: null, item: null })}
          item={formModal.item}
          type={formModal.type}
          onSave={(formData) => handleSave(formData, formModal.type)}
          collectionId={selectedCollection?.id}
        />
      </div>

    <ConfirmationModal
      isOpen={confirmState.isOpen}
      onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
      onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
      title={confirmState.title}
      message={confirmState.message}
    />
    </>
  );
}

