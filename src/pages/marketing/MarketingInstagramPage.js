import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ConfirmationModal from '../../components/ConfirmationModal';
import AlertDialog from '../../components/ui/AlertDialog';
import {
  PhotoIcon,
  SparklesIcon,
  PencilSquareIcon,
  TrashIcon,
  PlusIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowUpOnSquareIcon,
  XMarkIcon,
  FilmIcon,
  RectangleStackIcon,
  ExclamationTriangleIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';

/**
 * MarketingInstagramPage - Instagram post management
 *
 * Features AI-powered caption generation and scheduling
 */
export default function MarketingInstagramPage() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState({ enabled: false, message: '' });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [alertState, setAlertState] = useState({ isOpen: false, title: '', message: '' });
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });
  const [createForm, setCreateForm] = useState({
    postType: 'image',
    caption: '',
    hashtags: [],
    mediaUrls: [''],
    description: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [postsRes, statsRes, statusRes] = await Promise.all([
        fetch('/api/marketing-command-center/instagram'),
        fetch('/api/marketing-command-center/instagram/stats'),
        fetch('/api/marketing-command-center/instagram/status'),
      ]);

      if (postsRes.ok) {
        const data = await postsRes.json();
        setPosts(data);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
      if (statusRes.ok) {
        const data = await statusRes.json();
        setApiStatus(data);
      }
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCaption = async () => {
    if (!createForm.description) return;

    setGenerating(true);
    try {
      const res = await fetch('/api/marketing-command-center/instagram/generate-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: createForm.description,
          mediaType: createForm.postType,
          tone: 'fun',
          includeEmojis: true,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setCreateForm(prev => ({
          ...prev,
          caption: data.caption,
          hashtags: data.hashtags || [],
        }));
      }
    } catch (err) {
      console.error('Error generating caption:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleCreate = async () => {
    if (!createForm.caption && createForm.mediaUrls.filter(u => u).length === 0) {
      setAlertState({ isOpen: true, title: 'Notice', message: 'Please add content or media' });
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/marketing-command-center/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postType: createForm.postType,
          caption: createForm.caption,
          hashtags: createForm.hashtags,
          mediaUrls: createForm.mediaUrls.filter(u => u),
        }),
      });

      if (res.ok) {
        const draft = await res.json();
        setShowCreateModal(false);
        setCreateForm({
          postType: 'image',
          caption: '',
          hashtags: [],
          mediaUrls: [''],
          description: '',
        });
        navigate(`/marketing/instagram/${draft.id}`);
      }
    } catch (err) {
      console.error('Error creating post:', err);
      setAlertState({ isOpen: true, title: 'Error', message: 'Failed to create post. Please try again.' });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (id) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Post Draft',
      message: 'Are you sure you want to delete this post draft?',
      action: async () => {
        try {
          const res = await fetch(`/api/marketing-command-center/instagram/${id}`, {
            method: 'DELETE',
          });
          if (res.ok) {
            setPosts(posts.filter(p => p.id !== id));
            loadData();
          }
        } catch (err) {
          console.error('Error deleting post:', err);
        }
      },
    });
  };

  const getStatusBadge = (status) => {
    const styles = {
      draft: { bg: 'bg-neutral-100', text: 'text-neutral-700', icon: PencilSquareIcon },
      pending_review: { bg: 'bg-amber-100', text: 'text-amber-700', icon: ClockIcon },
      approved: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircleIcon },
      scheduled: { bg: 'bg-blue-100', text: 'text-blue-700', icon: CalendarDaysIcon },
      published: { bg: 'bg-green-100', text: 'text-green-700', icon: ArrowUpOnSquareIcon },
      failed: { bg: 'bg-red-100', text: 'text-red-700', icon: ExclamationTriangleIcon },
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

  const getPostTypeIcon = (type) => {
    switch (type) {
      case 'carousel':
        return <RectangleStackIcon className="h-4 w-4" />;
      case 'reel':
        return <FilmIcon className="h-4 w-4" />;
      case 'story':
        return <CalendarDaysIcon className="h-4 w-4" />;
      default:
        return <PhotoIcon className="h-4 w-4" />;
    }
  };

  const addMediaUrl = () => {
    setCreateForm(prev => ({
      ...prev,
      mediaUrls: [...prev.mediaUrls, ''],
    }));
  };

  const updateMediaUrl = (index, value) => {
    const urls = [...createForm.mediaUrls];
    urls[index] = value;
    setCreateForm(prev => ({ ...prev, mediaUrls: urls }));
  };

  const removeMediaUrl = (index) => {
    setCreateForm(prev => ({
      ...prev,
      mediaUrls: prev.mediaUrls.filter((_, i) => i !== index),
    }));
  };

  return (
    <>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Instagram Manager</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Create and schedule Instagram posts with AI-generated captions
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-pink to-brand-orange text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
          >
            <PlusIcon className="h-4 w-4" />
            Create Post
          </button>
        </div>

        {/* API Status Banner */}
        {!apiStatus.enabled && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Instagram API Not Configured</p>
                <p className="text-xs text-amber-600 mt-1">
                  {apiStatus.message || 'Set INSTAGRAM_BUSINESS_ACCOUNT_ID and META_ACCESS_TOKEN to enable publishing.'}
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  You can still create and manage drafts - publishing will be available once configured.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <p className="text-xs font-medium text-neutral-500">Drafts</p>
              <p className="text-2xl font-bold text-neutral-900">{stats.drafts || 0}</p>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <p className="text-xs font-medium text-neutral-500">Pending</p>
              <p className="text-2xl font-bold text-amber-600">{stats.pending_review || 0}</p>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <p className="text-xs font-medium text-neutral-500">Approved</p>
              <p className="text-2xl font-bold text-emerald-600">{stats.approved || 0}</p>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <p className="text-xs font-medium text-neutral-500">Scheduled</p>
              <p className="text-2xl font-bold text-blue-600">{stats.scheduled || 0}</p>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <p className="text-xs font-medium text-neutral-500">Published</p>
              <p className="text-2xl font-bold text-green-600">{stats.published || 0}</p>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <p className="text-xs font-medium text-neutral-500">Failed</p>
              <p className="text-2xl font-bold text-red-600">{stats.failed || 0}</p>
            </div>
          </div>
        )}

        {/* Posts List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-brand-pink/20 border-t-brand-pink rounded-full" />
          </div>
        ) : posts.length > 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200 divide-y divide-neutral-200">
            {posts.map((post) => (
              <div key={post.id} className="p-4 hover:bg-neutral-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-neutral-400">{getPostTypeIcon(post.post_type)}</span>
                      <Link
                        to={`/marketing/instagram/${post.id}`}
                        className="text-sm font-medium text-neutral-900 hover:text-brand-pink truncate"
                      >
                        {post.caption?.substring(0, 50) || `${post.post_type.charAt(0).toUpperCase() + post.post_type.slice(1)} Post`}
                        {post.caption?.length > 50 ? '...' : ''}
                      </Link>
                      {getStatusBadge(post.status)}
                    </div>
                    {post.hashtags && post.hashtags.length > 0 && (
                      <p className="text-xs text-neutral-400 mb-2">
                        {(Array.isArray(post.hashtags) ? post.hashtags : []).slice(0, 5).map(h => `#${h.replace('#', '')}`).join(' ')}
                        {(Array.isArray(post.hashtags) ? post.hashtags : []).length > 5 && ` +${post.hashtags.length - 5} more`}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-neutral-400">
                      <span className="capitalize">{post.post_type}</span>
                      {post.scheduled_at && (
                        <span>Scheduled: {new Date(post.scheduled_at).toLocaleString()}</span>
                      )}
                      <span>Updated {new Date(post.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/marketing/instagram/${post.id}`}
                      className="p-2 text-neutral-400 hover:text-brand-pink hover:bg-neutral-100 rounded-lg"
                      title="Edit"
                    >
                      <PencilSquareIcon className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={() => handleDelete(post.id)}
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
            <PhotoIcon className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
            <p className="text-neutral-600 font-medium">No Instagram posts yet</p>
            <p className="text-sm text-neutral-400 mt-1 mb-4">
              Create your first post with AI-generated captions
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-pink to-brand-orange text-white text-sm font-medium rounded-lg hover:opacity-90"
            >
              <PlusIcon className="h-4 w-4" />
              Create Post
            </button>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-neutral-900">Create Instagram Post</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Post Type */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Post Type
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { value: 'image', label: 'Image', icon: PhotoIcon },
                    { value: 'carousel', label: 'Carousel', icon: RectangleStackIcon },
                    { value: 'reel', label: 'Reel', icon: FilmIcon },
                    { value: 'story', label: 'Story', icon: CalendarDaysIcon },
                  ].map(type => {
                    const Icon = type.icon;
                    return (
                      <button
                        key={type.value}
                        onClick={() => setCreateForm(prev => ({ ...prev, postType: type.value }))}
                        className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                          createForm.postType === type.value
                            ? 'border-brand-pink bg-brand-pink/5'
                            : 'border-neutral-200 hover:border-neutral-300'
                        }`}
                      >
                        <Icon className={`h-5 w-5 ${createForm.postType === type.value ? 'text-brand-pink' : 'text-neutral-400'}`} />
                        <span className={`text-xs font-medium ${createForm.postType === type.value ? 'text-brand-pink' : 'text-neutral-600'}`}>
                          {type.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* AI Caption Generator */}
              <div className="bg-gradient-to-br from-violet-50 to-pink-50 rounded-xl p-4 border border-violet-200">
                <div className="flex items-center gap-2 mb-2">
                  <SparklesIcon className="h-5 w-5 text-violet-600" />
                  <span className="text-sm font-medium text-violet-900">AI Caption Generator</span>
                </div>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe what you're posting (e.g., 'Kids playing chess outdoors in the park on a sunny day')"
                  rows={2}
                  className="w-full px-3 py-2 border border-violet-300 rounded-lg focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400 bg-white text-sm"
                />
                <button
                  onClick={handleGenerateCaption}
                  disabled={!createForm.description || generating}
                  className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
                >
                  {generating ? (
                    <>
                      <div className="animate-spin h-3 w-3 border-2 border-white/30 border-t-white rounded-full" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="h-3 w-3" />
                      Generate Caption
                    </>
                  )}
                </button>
              </div>

              {/* Caption */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Caption
                </label>
                <textarea
                  value={createForm.caption}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, caption: e.target.value }))}
                  placeholder="Write your caption here..."
                  rows={4}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-pink/20 focus:border-brand-pink"
                />
              </div>

              {/* Hashtags */}
              {createForm.hashtags.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Hashtags ({createForm.hashtags.length})
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {createForm.hashtags.map((tag, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-100 text-neutral-600 text-xs rounded-full"
                      >
                        #{tag.replace('#', '')}
                        <button
                          onClick={() => {
                            setCreateForm(prev => ({
                              ...prev,
                              hashtags: prev.hashtags.filter((_, idx) => idx !== i),
                            }));
                          }}
                          className="text-neutral-400 hover:text-neutral-600"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Media URLs */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Media URLs {createForm.postType === 'carousel' && '(2+ required)'}
                </label>
                {createForm.mediaUrls.map((url, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => updateMediaUrl(index, e.target.value)}
                      placeholder="https://example.com/image.jpg"
                      className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-pink/20 focus:border-brand-pink text-sm"
                    />
                    {createForm.mediaUrls.length > 1 && (
                      <button
                        onClick={() => removeMediaUrl(index)}
                        className="p-2 text-neutral-400 hover:text-red-500"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                ))}
                {createForm.postType === 'carousel' && (
                  <button
                    onClick={addMediaUrl}
                    className="text-sm text-brand-pink hover:text-brand-pink/80"
                  >
                    + Add another image
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-pink to-brand-orange text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {creating ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                    Creating...
                  </>
                ) : (
                  <>
                    <PlusIcon className="h-4 w-4" />
                    Create Draft
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
