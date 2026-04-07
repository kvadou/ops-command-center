import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ConfirmationModal from '../../components/ConfirmationModal';
import AlertDialog from '../../components/ui/AlertDialog';
import {
  DocumentTextIcon,
  SparklesIcon,
  PencilSquareIcon,
  TrashIcon,
  PlusIcon,
  EyeIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowUpOnSquareIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

/**
 * MarketingBlogsPage - Blog drafts management page
 *
 * Features AI-powered blog generation and approval workflow
 */
export default function MarketingBlogsPage() {
  const navigate = useNavigate();
  const [blogs, setBlogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });
  const [alertState, setAlertState] = useState({ isOpen: false, title: '', message: '' });
  const [generateForm, setGenerateForm] = useState({
    topic: '',
    targetAudience: 'Parents of children ages 3-12',
    tone: 'friendly',
    wordCount: 800,
    keywords: '',
  });

  useEffect(() => {
    loadBlogs();
    loadStats();
  }, []);

  const loadBlogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/marketing-command-center/blogs');
      if (res.ok) {
        const data = await res.json();
        setBlogs(data);
      }
    } catch (err) {
      console.error('Error loading blogs:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const res = await fetch('/api/marketing-command-center/blogs/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const handleGenerate = async () => {
    if (!generateForm.topic) return;

    setGenerating(true);
    try {
      // First generate the blog content
      const genRes = await fetch('/api/marketing-command-center/blogs/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: generateForm.topic,
          targetAudience: generateForm.targetAudience,
          tone: generateForm.tone,
          wordCount: generateForm.wordCount,
          keywords: generateForm.keywords.split(',').map(k => k.trim()).filter(k => k),
        }),
      });

      if (!genRes.ok) {
        throw new Error('Failed to generate blog');
      }

      const generated = await genRes.json();

      // Then create a draft with the generated content
      const draftRes = await fetch('/api/marketing-command-center/blogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: generated.title,
          contentMarkdown: generated.content,
          seoTitle: generated.seoTitle,
          seoDescription: generated.seoDescription,
          keywords: generated.suggestedKeywords,
          targetAudience: generateForm.targetAudience,
          aiPrompt: generateForm.topic,
        }),
      });

      if (draftRes.ok) {
        const draft = await draftRes.json();
        setShowGenerateModal(false);
        setGenerateForm({
          topic: '',
          targetAudience: 'Parents of children ages 3-12',
          tone: 'friendly',
          wordCount: 800,
          keywords: '',
        });
        navigate(`/marketing/blogs/${draft.id}`);
      }
    } catch (err) {
      console.error('Error generating blog:', err);
      setAlertState({ isOpen: true, title: 'Error', message: 'Failed to generate blog. Please try again.' });
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id) => {
    setConfirmState({
      isOpen: true,
      action: async () => {
        try {
          const res = await fetch(`/api/marketing-command-center/blogs/${id}`, {
            method: 'DELETE',
          });
          if (res.ok) {
            setBlogs(blogs.filter(b => b.id !== id));
            loadStats();
          }
        } catch (err) {
          console.error('Error deleting blog:', err);
        }
      },
      title: 'Delete Blog Draft',
      message: 'Are you sure you want to delete this blog draft?',
    });
  };

  const getStatusBadge = (status) => {
    const styles = {
      draft: { bg: 'bg-neutral-100', text: 'text-neutral-700', icon: PencilSquareIcon },
      pending_review: { bg: 'bg-amber-100', text: 'text-amber-700', icon: ClockIcon },
      approved: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircleIcon },
      published: { bg: 'bg-green-100', text: 'text-green-700', icon: ArrowUpOnSquareIcon },
      rejected: { bg: 'bg-red-100', text: 'text-red-700', icon: XMarkIcon },
    };
    const style = styles[status] || styles.draft;
    const Icon = style.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${style.bg} ${style.text}`}>
        <Icon className="h-3 w-3" />
        {status?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Draft'}
      </span>
    );
  };

  return (
    <>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Blog Drafts</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Create AI-powered blog content with approval workflow
            </p>
          </div>
          <button
            onClick={() => setShowGenerateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-purple to-brand-pink text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
          >
            <SparklesIcon className="h-4 w-4" />
            Generate with AI
          </button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <p className="text-xs font-medium text-neutral-500">Drafts</p>
              <p className="text-2xl font-bold text-neutral-900">{stats.drafts || 0}</p>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <p className="text-xs font-medium text-neutral-500">Pending Review</p>
              <p className="text-2xl font-bold text-amber-600">{stats.pending_review || 0}</p>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <p className="text-xs font-medium text-neutral-500">Approved</p>
              <p className="text-2xl font-bold text-emerald-600">{stats.approved || 0}</p>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <p className="text-xs font-medium text-neutral-500">Published</p>
              <p className="text-2xl font-bold text-green-600">{stats.published || 0}</p>
            </div>
          </div>
        )}

        {/* Blog Drafts List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-brand-purple/20 border-t-brand-purple rounded-full" />
          </div>
        ) : blogs.length > 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200 divide-y divide-neutral-200">
            {blogs.map((blog) => (
              <div key={blog.id} className="p-4 hover:bg-neutral-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link
                        to={`/marketing/blogs/${blog.id}`}
                        className="text-sm font-medium text-neutral-900 hover:text-brand-purple truncate"
                      >
                        {blog.title}
                      </Link>
                      {getStatusBadge(blog.status)}
                    </div>
                    {blog.seo_description && (
                      <p className="text-xs text-neutral-500 line-clamp-2 mb-2">
                        {blog.seo_description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-neutral-400">
                      <span>/{blog.slug}</span>
                      <span>Updated {new Date(blog.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/marketing/blogs/${blog.id}`}
                      className="p-2 text-neutral-400 hover:text-brand-purple hover:bg-neutral-100 rounded-lg"
                      title="Edit"
                    >
                      <PencilSquareIcon className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={() => handleDelete(blog.id)}
                      className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                      title="Delete"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-neutral-50 rounded-xl border-2 border-dashed border-neutral-200">
            <DocumentTextIcon className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
            <p className="text-neutral-600 font-medium">No blog drafts yet</p>
            <p className="text-sm text-neutral-400 mt-1 mb-4">
              Generate your first blog post with AI
            </p>
            <button
              onClick={() => setShowGenerateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white text-sm font-medium rounded-lg hover:bg-brand-purple/90"
            >
              <SparklesIcon className="h-4 w-4" />
              Generate with AI
            </button>
          </div>
        )}
      </div>

      {/* Generate Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-neutral-900">Generate Blog with AI</h3>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Blog Topic *
                </label>
                <input
                  type="text"
                  value={generateForm.topic}
                  onChange={(e) => setGenerateForm({ ...generateForm, topic: e.target.value })}
                  placeholder="e.g., How Chess Helps Kids Develop Critical Thinking"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Tone
                  </label>
                  <select
                    value={generateForm.tone}
                    onChange={(e) => setGenerateForm({ ...generateForm, tone: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple/20"
                  >
                    <option value="friendly">Friendly</option>
                    <option value="professional">Professional</option>
                    <option value="casual">Casual</option>
                    <option value="educational">Educational</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Word Count
                  </label>
                  <select
                    value={generateForm.wordCount}
                    onChange={(e) => setGenerateForm({ ...generateForm, wordCount: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple/20"
                  >
                    <option value={500}>~500 words</option>
                    <option value={800}>~800 words</option>
                    <option value={1200}>~1200 words</option>
                    <option value={1500}>~1500 words</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Target Audience
                </label>
                <input
                  type="text"
                  value={generateForm.targetAudience}
                  onChange={(e) => setGenerateForm({ ...generateForm, targetAudience: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  SEO Keywords (comma-separated)
                </label>
                <input
                  type="text"
                  value={generateForm.keywords}
                  onChange={(e) => setGenerateForm({ ...generateForm, keywords: e.target.value })}
                  placeholder="chess for kids, learn chess, chess lessons"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple/20"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowGenerateModal(false)}
                className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={!generateForm.topic || generating}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-purple to-brand-pink text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                    Generating...
                  </>
                ) : (
                  <>
                    <SparklesIcon className="h-4 w-4" />
                    Generate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
        onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
        title={confirmState.title}
        message={confirmState.message}
        isDestructive
      />
      <AlertDialog isOpen={alertState.isOpen} onClose={() => setAlertState(s => ({ ...s, isOpen: false }))} title={alertState.title} message={alertState.message} />
    </>
  );
}
