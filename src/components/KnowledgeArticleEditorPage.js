import { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useCompanyName } from '../contexts/CompanyNameContext';
import TipTapEditor from './TipTapEditor';
import AttachmentUploader from './AttachmentUploader';
import { ChecklistEditor } from './knowledge';
import {
  EyeIcon,
  DocumentCheckIcon,
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  PlayIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import ConfirmationModal from './ConfirmationModal';
import { useToast } from '../hooks/useToast';

/**
 * KnowledgeArticleEditorPage - Create or edit Knowledge Hub articles
 * Features: TipTap editor, attachments, video links, tags, collection selector, preview
 */
export default function KnowledgeArticleEditorPage() {
  const { articleId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isMainBranch } = useCompanyName();

  // Get collection from URL query parameter (for "Add Article" from collection page)
  const collectionFromUrl = searchParams.get('collection');

  const toast = useToast();
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });
  const [loading, setLoading] = useState(!!articleId);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  // Form state - pre-populate collectionId from URL if provided
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [collectionId, setCollectionId] = useState(collectionFromUrl || '');
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [attachments, setAttachments] = useState([]);
  // SOP fields
  const [articleType, setArticleType] = useState('article');
  const [sopVersion, setSopVersion] = useState('');
  const [sopOwner, setSopOwner] = useState('');
  const [sopRequired, setSopRequired] = useState(false);
  const [sopAudience, setSopAudience] = useState([]);
  
  // Collections for dropdown
  const [collections, setCollections] = useState([]);

  useEffect(() => {
    fetchCollections();
    if (articleId) {
      fetchArticle();
    }
  }, [articleId]);

  const fetchCollections = async () => {
    try {
      const response = await fetch('/api/knowledge/collections');
      const data = await response.json();
      setCollections(data.collections || []);
    } catch (error) {
      console.error('Error fetching collections:', error);
    }
  };

  const fetchArticle = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/knowledge/articles/${articleId}`);
      const data = await response.json();
      
      if (data.article) {
        setTitle(data.article.title || '');
        setSummary(data.article.summary || '');
        setContent(JSON.stringify(data.article.content) || '');
        setCollectionId(data.article.collection_id || '');
        setTags(data.article.tags || []);
        setVideoUrl(data.article.video_url || '');
        setIsPublished(data.article.is_published || false);
        setAttachments(data.attachments || []);
        setArticleType(data.article.article_type || 'article');
        setSopVersion(data.article.sop_version || '');
        setSopOwner(data.article.sop_owner || '');
        setSopRequired(data.article.sop_required || false);
        setSopAudience(data.article.sop_audience || []);
      }
    } catch (error) {
      console.error('Error fetching article:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (publish = false) => {
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    if (!collectionId) {
      toast.error('Please select a collection');
      return;
    }

    try {
      setSaving(true);
      
      // Parse content if it's a JSON string
      let contentToSave = content;
      if (typeof content === 'string' && content.trim()) {
        try {
          contentToSave = JSON.parse(content);
        } catch (e) {
          // If not valid JSON, wrap it in a basic TipTap structure
          contentToSave = {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: content }]
              }
            ]
          };
        }
      }
      
      const articleData = {
        title: title.trim(),
        summary: summary || null,
        content: contentToSave,
        collection_id: parseInt(collectionId, 10),
        tags,
        video_url: videoUrl || null,
        is_published: publish,
        article_type: articleType,
        sop_version: sopVersion || null,
        sop_owner: sopOwner || null,
        sop_required: sopRequired,
        sop_audience: sopAudience,
      };
      
      console.log('Saving article with data:', articleData);

      const url = articleId 
        ? `/api/knowledge/articles/${articleId}`
        : '/api/knowledge/articles';
      
      const method = articleId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(articleData),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save article');
      }
      
      toast.success(publish ? 'Article published successfully!' : 'Article saved as draft!');
      navigate(`/knowledge/articles/${data.article.id}`);
    } catch (error) {
      console.error('Error saving article:', error);
      toast.error(`Failed to save article: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAddTag = (e) => {
    e.preventDefault();
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleAttachmentUploaded = (newAttachment) => {
    setAttachments([...attachments, newAttachment]);
  };

  const handleRemoveAttachment = (attachmentId) => {
    setConfirmState({
      isOpen: true,
      title: 'Remove Attachment',
      message: 'Are you sure you want to remove this attachment?',
      action: async () => {
        try {
          await fetch(`/api/knowledge/attachments/${attachmentId}`, {
            method: 'DELETE',
          });
          setAttachments(attachments.filter(a => a.id !== attachmentId));
        } catch (error) {
          console.error('Error removing attachment:', error);
        }
      }
    });
  };

  if (!isMainBranch) {
    return (
        <div className="max-w-7xl mx-auto w-full text-center py-12">
          <h2 className="text-2xl font-bold text-neutral-900 mb-4">Access Denied</h2>
          <p className="text-neutral-600">Only main branch administrators can create or edit articles.</p>
          <Link
            to="/knowledge"
            className="mt-4 inline-block text-brand-purple hover:text-brand-navy"
          >
            ← Back to Knowledge Hub
          </Link>
        </div>
    );
  }

  if (loading) {
    return (
        <div className="max-w-7xl mx-auto w-full text-center py-12">
          <p className="text-neutral-500">Loading article...</p>
        </div>
    );
  }

  return (
    <>
      <div className="max-w-5xl mx-auto w-full">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">
              {articleId ? 'Edit Article' : 'Create New Article'}
            </h1>
            <Link
              to="/knowledge/admin"
              className="text-sm text-brand-purple hover:text-brand-navy"
            >
              ← Back to Admin
            </Link>
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="inline-flex items-center gap-2 px-4 py-2 border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 bg-white hover:bg-neutral-50 transition-colors"
            >
              <EyeIcon className="h-5 w-5" />
              {showPreview ? 'Edit' : 'Preview'}
            </button>
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 bg-white hover:bg-neutral-50 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-navy transition-colors disabled:opacity-50"
            >
              <DocumentCheckIcon className="h-5 w-5" />
              {saving ? 'Publishing...' : 'Publish'}
            </button>
          </div>
        </div>

        {showPreview ? (
          /* Preview Mode */
          <div className="bg-white rounded-xl border border-neutral-200 p-8">
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-neutral-900 mb-4">{title || 'Untitled Article'}</h1>
              {summary && (
                <p className="text-lg text-neutral-600">{summary}</p>
              )}
            </div>
            
            {videoUrl && (
              <div className="mb-6 bg-neutral-50 rounded-lg p-4">
                <div className="flex items-center gap-2 text-brand-purple mb-2">
                  <PlayIcon className="h-5 w-5" />
                  <span className="font-medium">Video</span>
                </div>
                <p className="text-sm text-neutral-600 break-all">{videoUrl}</p>
              </div>
            )}

            <div className="prose max-w-none">
              {content ? (
                <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }} />
              ) : (
                <p className="text-neutral-400 italic">No content yet</p>
              )}
            </div>

            {tags.length > 0 && (
              <div className="mt-6 pt-6 border-t border-neutral-200">
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-brand-light text-brand-purple rounded-full text-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {attachments.length > 0 && (
              <div className="mt-6 pt-6 border-t border-neutral-200">
                <h3 className="font-semibold text-neutral-900 mb-3">Attachments</h3>
                <div className="space-y-2">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg"
                    >
                      <span className="text-sm text-neutral-700">{attachment.file_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Edit Mode */
          <div className="space-y-6">
            {/* Title */}
            <div className="bg-white rounded-xl border border-neutral-200 p-6">
              <label className="block text-sm font-medium text-neutral-900 mb-2">
                Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter article title..."
                className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent text-lg"
              />
            </div>

            {/* Summary */}
            <div className="bg-white rounded-xl border border-neutral-200 p-6">
              <label className="block text-sm font-medium text-neutral-900 mb-2">
                Summary
              </label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Brief summary for article cards..."
                rows={3}
                className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent"
              />
            </div>

            {/* Collection Selector */}
            <div className="bg-white rounded-xl border border-neutral-200 p-6">
              <label className="block text-sm font-medium text-neutral-900 mb-2">
                Collection *
              </label>
              <select
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
                className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent"
              >
                <option value="">Select a collection...</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Content Editor */}
            <div className="bg-white rounded-xl border border-neutral-200 p-6">
              <label className="block text-sm font-medium text-neutral-900 mb-4">
                Content
              </label>
              <TipTapEditor
                content={content}
                onChange={setContent}
              />
            </div>

            {/* Video URL */}
            <div className="bg-white rounded-xl border border-neutral-200 p-6">
              <label className="block text-sm font-medium text-neutral-900 mb-2">
                Video URL (YouTube or Loom)
              </label>
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... or https://www.loom.com/share/..."
                className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent"
              />
            </div>

            {/* Tags */}
            <div className="bg-white rounded-xl border border-neutral-200 p-6">
              <label className="block text-sm font-medium text-neutral-900 mb-2">
                Tags
              </label>
              <form onSubmit={handleAddTag} className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Add a tag..."
                  className="flex-1 px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors"
                >
                  <PlusIcon className="h-5 w-5" />
                  Add
                </button>
              </form>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-2 px-3 py-1 bg-brand-light text-brand-purple rounded-full text-sm"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-brand-navy"
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Article Type Toggle */}
            <div className="bg-white rounded-xl border border-neutral-200 p-6">
              <label className="block text-sm font-medium text-neutral-900 mb-3">
                Article Type
              </label>
              <div className="flex gap-2">
                {['article', 'sop'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setArticleType(type)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                      articleType === type
                        ? 'bg-brand-purple text-white'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {type === 'sop' ? 'SOP' : 'Article'}
                  </button>
                ))}
              </div>
            </div>

            {/* SOP Metadata (shown when article_type = 'sop') */}
            {articleType === 'sop' && (
              <div className="bg-amber-50 rounded-xl border border-amber-200 p-6 space-y-4">
                <h3 className="text-sm font-semibold text-amber-900">SOP Settings</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Version</label>
                    <input
                      type="text"
                      value={sopVersion}
                      onChange={(e) => setSopVersion(e.target.value)}
                      placeholder="e.g. 1.0"
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Owner</label>
                    <input
                      type="text"
                      value={sopOwner}
                      onChange={(e) => setSopOwner(e.target.value)}
                      placeholder="e.g. Operations Team"
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">Audience</label>
                  <div className="flex flex-wrap gap-2">
                    {['franchisee', 'o&o', 'staff', 'all'].map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() =>
                          setSopAudience((prev) =>
                            prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]
                          )
                        }
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          sopAudience.includes(a)
                            ? 'bg-brand-purple text-white'
                            : 'bg-white border border-neutral-300 text-neutral-600 hover:border-brand-purple'
                        }`}
                      >
                        {a === 'o&o' ? 'O&O' : a.charAt(0).toUpperCase() + a.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="sop-required"
                    checked={sopRequired}
                    onChange={(e) => setSopRequired(e.target.checked)}
                    className="h-4 w-4 text-brand-purple rounded border-neutral-300 focus:ring-brand-purple"
                  />
                  <label htmlFor="sop-required" className="text-sm font-medium text-neutral-700">
                    Required reading for franchisees
                  </label>
                </div>
              </div>
            )}

            {/* Attachments */}
            <div className="bg-white rounded-xl border border-neutral-200 p-6">
              <label className="block text-sm font-medium text-neutral-900 mb-4">
                Attachments
              </label>
              
              {articleId && (
                <AttachmentUploader
                  articleId={articleId}
                  onUploadComplete={handleAttachmentUploaded}
                />
              )}
              
              {!articleId && (
                <p className="text-sm text-neutral-500 italic">
                  Save the article first to enable attachments
                </p>
              )}

              {attachments.length > 0 && (
                <div className="mt-4 space-y-2">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg"
                    >
                      <span className="text-sm text-neutral-700">{attachment.file_name}</span>
                      <button
                        onClick={() => handleRemoveAttachment(attachment.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Onboarding Checklist */}
            <div>
              <label className="block text-sm font-medium text-neutral-900 mb-3 flex items-center gap-2">
                <CheckCircleIcon className="h-5 w-5 text-brand-purple" />
                Onboarding Checklist
              </label>
              <ChecklistEditor 
                articleId={articleId} 
                onChecklistChange={() => {}}
              />
            </div>

            {/* Publish Status */}
            <div className="bg-white rounded-xl border border-neutral-200 p-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  className="w-5 h-5 text-brand-purple border-neutral-300 rounded focus:ring-brand-purple"
                />
                <div>
                  <span className="text-sm font-medium text-neutral-900">
                    Published
                  </span>
                  <p className="text-xs text-neutral-500">
                    Make this article visible to all franchisees
                  </p>
                </div>
              </label>
            </div>
          </div>
        )}
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

