import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import AlertDialog from '../../components/ui/AlertDialog';
import PromptDialog from '../../components/ui/PromptDialog';
import {
  ArrowLeftIcon,
  DocumentTextIcon,
  EyeIcon,
  CheckIcon,
  XMarkIcon,
  ArrowUpOnSquareIcon,
  ClipboardDocumentIcon,
  SparklesIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';

/**
 * BlogEditorPage - Edit and manage a single blog draft
 *
 * Features markdown editing, SEO fields, preview, and workflow actions
 */
export default function BlogEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [blog, setBlog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('edit'); // edit | preview | seo
  const [hasChanges, setHasChanges] = useState(false);
  const [alertState, setAlertState] = useState({ isOpen: false, title: '', message: '' });
  const [promptState, setPromptState] = useState({ isOpen: false, title: '', defaultValue: '' });

  useEffect(() => {
    loadBlog();
  }, [id]);

  const loadBlog = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/marketing-command-center/blogs/${id}`);
      if (res.ok) {
        const data = await res.json();
        setBlog(data);
      } else {
        navigate('/marketing/blogs');
      }
    } catch (err) {
      console.error('Error loading blog:', err);
      navigate('/marketing/blogs');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/marketing-command-center/blogs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: blog.title,
          slug: blog.slug,
          contentMarkdown: blog.content_markdown,
          seoTitle: blog.seo_title,
          seoDescription: blog.seo_description,
          keywords: blog.keywords,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setBlog(updated);
        setHasChanges(false);
      }
    } catch (err) {
      console.error('Error saving blog:', err);
      setAlertState({ isOpen: true, title: 'Error', message: 'Failed to save changes' });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (hasChanges) {
      await handleSave();
    }
    try {
      const res = await fetch(`/api/marketing-command-center/blogs/${id}/submit-review`, {
        method: 'POST',
      });
      if (res.ok) {
        const updated = await res.json();
        setBlog(updated);
      }
    } catch (err) {
      console.error('Error submitting for review:', err);
      setAlertState({ isOpen: true, title: 'Error', message: 'Failed to submit for review' });
    }
  };

  const handleApprove = async () => {
    try {
      const res = await fetch(`/api/marketing-command-center/blogs/${id}/approve`, {
        method: 'POST',
      });
      if (res.ok) {
        const updated = await res.json();
        setBlog(updated);
      }
    } catch (err) {
      console.error('Error approving blog:', err);
      setAlertState({ isOpen: true, title: 'Error', message: 'Failed to approve' });
    }
  };

  const handleReject = async () => {
    setPromptState({ isOpen: true, title: 'Reject Blog', defaultValue: '' });
  };

  const executeReject = async (reason) => {
    try {
      const res = await fetch(`/api/marketing-command-center/blogs/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        const updated = await res.json();
        setBlog(updated);
      }
    } catch (err) {
      console.error('Error rejecting blog:', err);
      setAlertState({ isOpen: true, title: 'Error', message: 'Failed to reject' });
    }
  };

  const handleExportWebflow = async () => {
    try {
      const res = await fetch(`/api/marketing-command-center/blogs/${id}/export-webflow`, {
        method: 'POST',
      });
      if (res.ok) {
        const exported = await res.json();
        // Copy HTML to clipboard
        await navigator.clipboard.writeText(exported.html);
        setAlertState({ isOpen: true, title: 'Success', message: 'Webflow HTML copied to clipboard!' });
      }
    } catch (err) {
      console.error('Error exporting:', err);
      setAlertState({ isOpen: true, title: 'Error', message: 'Failed to export' });
    }
  };

  const handleMarkPublished = async () => {
    try {
      const res = await fetch(`/api/marketing-command-center/blogs/${id}/publish`, {
        method: 'POST',
      });
      if (res.ok) {
        const updated = await res.json();
        setBlog(updated);
      }
    } catch (err) {
      console.error('Error marking as published:', err);
      setAlertState({ isOpen: true, title: 'Error', message: 'Failed to mark as published' });
    }
  };

  const updateField = (field, value) => {
    setBlog(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const getStatusBadge = (status) => {
    const styles = {
      draft: 'bg-neutral-100 text-neutral-700',
      pending_review: 'bg-amber-100 text-amber-700',
      approved: 'bg-emerald-100 text-emerald-700',
      published: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || styles.draft}`}>
        {status?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Draft'}
      </span>
    );
  };

  // Simple markdown to HTML conversion for preview
  const renderPreview = (markdown) => {
    if (!markdown) return '';
    let html = markdown;
    html = html.replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-6 mb-2">$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mt-8 mb-3">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-8 mb-4">$1</h1>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-brand-purple underline">$1</a>');
    html = html.replace(/^\- (.*$)/gim, '<li class="ml-4">$1</li>');
    html = html.split(/\n\n/).map(para => {
      para = para.trim();
      if (!para) return '';
      if (para.startsWith('<h') || para.startsWith('<li')) return para;
      return `<p class="mb-4">${para}</p>`;
    }).join('\n');
    return html;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-brand-purple/20 border-t-brand-purple rounded-full" />
      </div>
    );
  }

  if (!blog) {
    return (
      <div className="text-center py-12">
        <p className="text-neutral-500">Blog not found</p>
        <Link to="/marketing/blogs" className="text-brand-purple hover:underline mt-2 inline-block">
          Back to Blogs
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Link
              to="/marketing/blogs"
              className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-neutral-900 truncate max-w-md">
                  {blog.title || 'Untitled Blog'}
                </h1>
                {getStatusBadge(blog.status)}
              </div>
              <p className="text-xs text-neutral-500">/{blog.slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Status-based Actions */}
            {blog.status === 'draft' && (
              <>
                <button
                  onClick={handleSubmitForReview}
                  className="px-3 py-1.5 text-sm text-amber-600 border border-amber-300 rounded-lg hover:bg-amber-50"
                >
                  Submit for Review
                </button>
              </>
            )}
            {blog.status === 'pending_review' && (
              <>
                <button
                  onClick={handleReject}
                  className="px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
                >
                  Reject
                </button>
                <button
                  onClick={handleApprove}
                  className="px-3 py-1.5 text-sm text-emerald-600 border border-emerald-300 rounded-lg hover:bg-emerald-50"
                >
                  Approve
                </button>
              </>
            )}
            {blog.status === 'approved' && (
              <>
                <button
                  onClick={handleExportWebflow}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-neutral-600 border border-neutral-300 rounded-lg hover:bg-neutral-50"
                >
                  <ClipboardDocumentIcon className="h-4 w-4" />
                  Export HTML
                </button>
                <button
                  onClick={handleMarkPublished}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-green-600 border border-green-300 rounded-lg hover:bg-green-50"
                >
                  <ArrowUpOnSquareIcon className="h-4 w-4" />
                  Mark Published
                </button>
              </>
            )}
            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-brand-purple text-white rounded-lg hover:bg-brand-purple/90 disabled:opacity-50"
            >
              {saving ? (
                <div className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
              ) : (
                <CheckIcon className="h-4 w-4" />
              )}
              Save
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-neutral-200 mb-4">
          <nav className="flex gap-6">
            <button
              onClick={() => setActiveTab('edit')}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'edit'
                  ? 'border-brand-purple text-brand-purple'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
            >
              <span className="flex items-center gap-1">
                <PencilSquareIcon className="h-4 w-4" />
                Edit
              </span>
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'preview'
                  ? 'border-brand-purple text-brand-purple'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
            >
              <span className="flex items-center gap-1">
                <EyeIcon className="h-4 w-4" />
                Preview
              </span>
            </button>
            <button
              onClick={() => setActiveTab('seo')}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'seo'
                  ? 'border-brand-purple text-brand-purple'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
            >
              <span className="flex items-center gap-1">
                <DocumentTextIcon className="h-4 w-4" />
                SEO
              </span>
            </button>
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto">
          {/* Edit Tab */}
          {activeTab === 'edit' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Title</label>
                <input
                  type="text"
                  value={blog.title || ''}
                  onChange={(e) => updateField('title', e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">URL Slug</label>
                <input
                  type="text"
                  value={blog.slug || ''}
                  onChange={(e) => updateField('slug', e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Content (Markdown)
                </label>
                <textarea
                  value={blog.content_markdown || ''}
                  onChange={(e) => updateField('content_markdown', e.target.value)}
                  rows={20}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple font-mono text-sm"
                  placeholder="Write your blog content in Markdown..."
                />
              </div>
            </div>
          )}

          {/* Preview Tab */}
          {activeTab === 'preview' && (
            <div className="bg-white rounded-xl border border-neutral-200 p-8 max-w-3xl mx-auto">
              <h1 className="text-3xl font-bold text-neutral-900 mb-4">{blog.title}</h1>
              <div
                className="prose prose-slate max-w-none"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderPreview(blog.content_markdown)) }}
              />
            </div>
          )}

          {/* SEO Tab */}
          {activeTab === 'seo' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  SEO Title
                  <span className="text-xs text-neutral-400 ml-2">
                    ({(blog.seo_title?.length || 0)}/60)
                  </span>
                </label>
                <input
                  type="text"
                  value={blog.seo_title || ''}
                  onChange={(e) => updateField('seo_title', e.target.value)}
                  maxLength={60}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
                  placeholder="Title for search engine results"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Meta Description
                  <span className="text-xs text-neutral-400 ml-2">
                    ({(blog.seo_description?.length || 0)}/160)
                  </span>
                </label>
                <textarea
                  value={blog.seo_description || ''}
                  onChange={(e) => updateField('seo_description', e.target.value)}
                  maxLength={160}
                  rows={3}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
                  placeholder="Description for search engine results"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Keywords
                </label>
                <input
                  type="text"
                  value={Array.isArray(blog.keywords) ? blog.keywords.join(', ') : ''}
                  onChange={(e) => updateField('keywords', e.target.value.split(',').map(k => k.trim()))}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
                  placeholder="Comma-separated keywords"
                />
              </div>

              {/* SEO Preview */}
              <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200">
                <p className="text-xs text-neutral-500 mb-2">Search Engine Preview</p>
                <div className="bg-white p-4 rounded border border-neutral-200">
                  <p className="text-blue-600 text-lg hover:underline cursor-pointer">
                    {blog.seo_title || blog.title || 'Page Title'}
                  </p>
                  <p className="text-green-700 text-sm">
                    acmeops.com/blog/{blog.slug || 'page-slug'}
                  </p>
                  <p className="text-sm text-neutral-600 mt-1">
                    {blog.seo_description || 'Meta description will appear here...'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <AlertDialog isOpen={alertState.isOpen} onClose={() => setAlertState(s => ({ ...s, isOpen: false }))} title={alertState.title} message={alertState.message} />
      <PromptDialog
        isOpen={promptState.isOpen}
        onClose={() => setPromptState(s => ({ ...s, isOpen: false }))}
        onSubmit={(val) => executeReject(val)}
        title={promptState.title}
        message="Reason for rejection (optional):"
        placeholder="Enter reason..."
        defaultValue={promptState.defaultValue}
        submitText="Reject"
      />
    </>
  );
}
