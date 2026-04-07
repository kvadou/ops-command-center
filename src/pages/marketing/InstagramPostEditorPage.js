import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ConfirmationModal from '../../components/ConfirmationModal';
import AlertDialog from '../../components/ui/AlertDialog';
import PromptDialog from '../../components/ui/PromptDialog';
import {
  ArrowLeftIcon,
  SparklesIcon,
  PhotoIcon,
  FilmIcon,
  RectangleStackIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowUpOnSquareIcon,
  XMarkIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  LinkIcon,
  HashtagIcon,
} from '@heroicons/react/24/outline';

/**
 * InstagramPostEditorPage - Edit Instagram post drafts
 *
 * Features:
 * - Edit/Preview tabs
 * - AI caption regeneration
 * - Scheduling
 * - Workflow actions (submit, approve, publish)
 */
export default function InstagramPostEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [activeTab, setActiveTab] = useState('edit');
  const [apiStatus, setApiStatus] = useState({ enabled: false });
  const [alertState, setAlertState] = useState({ isOpen: false, title: '', message: '' });
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });
  const [promptState, setPromptState] = useState({ isOpen: false, title: '', defaultValue: '' });
  const [form, setForm] = useState({
    caption: '',
    hashtags: [],
    mediaUrls: [],
    scheduledAt: '',
    description: '',
  });

  useEffect(() => {
    loadPost();
    loadApiStatus();
  }, [id]);

  const loadPost = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/marketing-command-center/instagram/${id}`);
      if (res.ok) {
        const data = await res.json();
        setPost(data);
        setForm({
          caption: data.caption || '',
          hashtags: Array.isArray(data.hashtags) ? data.hashtags : [],
          mediaUrls: Array.isArray(data.media_urls) ? data.media_urls : [],
          scheduledAt: data.scheduled_at ? new Date(data.scheduled_at).toISOString().slice(0, 16) : '',
          description: '',
        });
      } else {
        navigate('/marketing/instagram');
      }
    } catch (err) {
      console.error('Error loading post:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadApiStatus = async () => {
    try {
      const res = await fetch('/api/marketing-command-center/instagram/status');
      if (res.ok) {
        setApiStatus(await res.json());
      }
    } catch (err) {
      console.error('Error loading API status:', err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/marketing-command-center/instagram/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption: form.caption,
          hashtags: form.hashtags,
          mediaUrls: form.mediaUrls,
          scheduledAt: form.scheduledAt || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPost(data);
      }
    } catch (err) {
      console.error('Error saving:', err);
      setAlertState({ isOpen: true, title: 'Error', message: 'Failed to save changes' });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateCaption = async () => {
    if (!form.description) {
      setAlertState({ isOpen: true, title: 'Notice', message: 'Please describe your post first' });
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch('/api/marketing-command-center/instagram/generate-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: form.description,
          mediaType: post?.post_type || 'image',
          tone: 'fun',
          includeEmojis: true,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setForm(prev => ({
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

  const handleSubmitForReview = async () => {
    try {
      await handleSave();
      const res = await fetch(`/api/marketing-command-center/instagram/${id}/submit-review`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setPost(data);
      }
    } catch (err) {
      console.error('Error submitting:', err);
      setAlertState({ isOpen: true, title: 'Error', message: 'Failed to submit for review' });
    }
  };

  const handleApprove = async () => {
    try {
      const res = await fetch(`/api/marketing-command-center/instagram/${id}/approve`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setPost(data);
      }
    } catch (err) {
      console.error('Error approving:', err);
      setAlertState({ isOpen: true, title: 'Error', message: 'Failed to approve' });
    }
  };

  const handleReject = () => {
    setPromptState({
      isOpen: true,
      title: 'Rejection Reason',
      message: 'Provide a reason for rejection (optional):',
      defaultValue: '',
      placeholder: 'Reason...',
      onSubmit: async (reason) => {
        try {
          const res = await fetch(`/api/marketing-command-center/instagram/${id}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason }),
          });
          if (res.ok) {
            const data = await res.json();
            setPost(data);
          }
        } catch (err) {
          console.error('Error rejecting:', err);
          setAlertState({ isOpen: true, title: 'Error', message: 'Failed to reject' });
        }
      },
    });
  };

  const handlePublish = () => {
    setConfirmState({
      isOpen: true,
      title: 'Publish Post',
      message: 'Publish this post to Instagram now?',
      action: async () => {
        setPublishing(true);
        try {
          const res = await fetch(`/api/marketing-command-center/instagram/${id}/publish`, {
            method: 'POST',
          });
          if (res.ok) {
            const data = await res.json();
            setPost(data);
            setAlertState({ isOpen: true, title: 'Success', message: 'Post published successfully!' });
          } else {
            const error = await res.json();
            setAlertState({ isOpen: true, title: 'Error', message: `Failed to publish: ${error.error || 'Unknown error'}` });
          }
        } catch (err) {
          console.error('Error publishing:', err);
          setAlertState({ isOpen: true, title: 'Error', message: 'Failed to publish' });
        } finally {
          setPublishing(false);
        }
      },
    });
  };

  const handleSchedule = async () => {
    if (!form.scheduledAt) {
      setAlertState({ isOpen: true, title: 'Notice', message: 'Please select a date and time to schedule' });
      return;
    }

    try {
      const res = await fetch(`/api/marketing-command-center/instagram/${id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: form.scheduledAt }),
      });
      if (res.ok) {
        const data = await res.json();
        setPost(data);
      }
    } catch (err) {
      console.error('Error scheduling:', err);
      setAlertState({ isOpen: true, title: 'Error', message: 'Failed to schedule' });
    }
  };

  const handleDelete = () => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Post Draft',
      message: 'Delete this post draft?',
      action: async () => {
        try {
          const res = await fetch(`/api/marketing-command-center/instagram/${id}`, {
            method: 'DELETE',
          });
          if (res.ok) {
            navigate('/marketing/instagram');
          }
        } catch (err) {
          console.error('Error deleting:', err);
        }
      },
    });
  };

  const getPostTypeIcon = () => {
    switch (post?.post_type) {
      case 'carousel':
        return <RectangleStackIcon className="h-5 w-5" />;
      case 'reel':
        return <FilmIcon className="h-5 w-5" />;
      case 'story':
        return <CalendarDaysIcon className="h-5 w-5" />;
      default:
        return <PhotoIcon className="h-5 w-5" />;
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      draft: { bg: 'bg-neutral-100', text: 'text-neutral-700', icon: null },
      pending_review: { bg: 'bg-amber-100', text: 'text-amber-700', icon: ClockIcon },
      approved: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircleIcon },
      scheduled: { bg: 'bg-blue-100', text: 'text-blue-700', icon: CalendarDaysIcon },
      published: { bg: 'bg-green-100', text: 'text-green-700', icon: ArrowUpOnSquareIcon },
      failed: { bg: 'bg-red-100', text: 'text-red-700', icon: ExclamationTriangleIcon },
    };
    const style = styles[status] || styles.draft;
    const Icon = style.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full ${style.bg} ${style.text}`}>
        {Icon && <Icon className="h-4 w-4" />}
        {status?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Draft'}
      </span>
    );
  };

  const addMediaUrl = () => {
    setForm(prev => ({
      ...prev,
      mediaUrls: [...prev.mediaUrls, ''],
    }));
  };

  const updateMediaUrl = (index, value) => {
    const urls = [...form.mediaUrls];
    urls[index] = value;
    setForm(prev => ({ ...prev, mediaUrls: urls }));
  };

  const removeMediaUrl = (index) => {
    setForm(prev => ({
      ...prev,
      mediaUrls: prev.mediaUrls.filter((_, i) => i !== index),
    }));
  };

  const addHashtag = (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      e.preventDefault();
      const tag = e.target.value.trim().replace('#', '');
      if (!form.hashtags.includes(tag)) {
        setForm(prev => ({
          ...prev,
          hashtags: [...prev.hashtags, tag],
        }));
      }
      e.target.value = '';
    }
  };

  const removeHashtag = (index) => {
    setForm(prev => ({
      ...prev,
      hashtags: prev.hashtags.filter((_, i) => i !== index),
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-brand-pink/20 border-t-brand-pink rounded-full" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="text-center py-12">
        <p className="text-neutral-600">Post not found</p>
        <Link to="/marketing/instagram" className="text-brand-pink hover:underline mt-2 inline-block">
          Back to Instagram
        </Link>
      </div>
    );
  }

  const fullCaption = form.caption + (form.hashtags.length > 0 ? '\n\n' + form.hashtags.map(h => `#${h}`).join(' ') : '');

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/marketing/instagram"
              className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-3">
              <span className="text-neutral-400">{getPostTypeIcon()}</span>
              <div>
                <h1 className="text-xl font-bold text-neutral-900 capitalize">
                  {post.post_type} Post
                </h1>
                <p className="text-sm text-neutral-500">ID: {post.id}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {getStatusBadge(post.status)}
            <button
              onClick={handleDelete}
              className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
              title="Delete"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Published Post Link */}
        {post.status === 'published' && post.instagram_permalink && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <CheckCircleIcon className="h-5 w-5 text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800">Published to Instagram</p>
                <a
                  href={post.instagram_permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-green-600 hover:underline flex items-center gap-1"
                >
                  <LinkIcon className="h-3 w-3" />
                  View on Instagram
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Failed Error */}
        {post.status === 'failed' && post.error_message && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-sm font-medium text-red-800">Publishing Failed</p>
                <p className="text-sm text-red-600">{post.error_message}</p>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-neutral-200">
          <div className="flex gap-4">
            {['edit', 'preview'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab
                    ? 'border-brand-pink text-brand-pink'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {activeTab === 'edit' ? (
              <>
                {/* AI Caption Generator */}
                <div className="bg-gradient-to-br from-violet-50 to-pink-50 rounded-xl p-4 border border-violet-200">
                  <div className="flex items-center gap-2 mb-2">
                    <SparklesIcon className="h-5 w-5 text-violet-600" />
                    <span className="text-sm font-medium text-violet-900">AI Caption Generator</span>
                  </div>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe what you're posting..."
                    rows={2}
                    className="w-full px-3 py-2 border border-violet-300 rounded-lg focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400 bg-white text-sm"
                  />
                  <button
                    onClick={handleGenerateCaption}
                    disabled={!form.description || generating}
                    className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
                  >
                    {generating ? 'Generating...' : 'Generate Caption'}
                  </button>
                </div>

                {/* Caption */}
                <div className="bg-white rounded-xl border border-neutral-200 p-4">
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Caption
                  </label>
                  <textarea
                    value={form.caption}
                    onChange={(e) => setForm(prev => ({ ...prev, caption: e.target.value }))}
                    rows={6}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-pink/20 focus:border-brand-pink"
                    placeholder="Write your caption..."
                  />
                  <p className="text-xs text-neutral-400 mt-1">
                    {form.caption.length} characters
                  </p>
                </div>

                {/* Hashtags */}
                <div className="bg-white rounded-xl border border-neutral-200 p-4">
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    <HashtagIcon className="h-4 w-4 inline mr-1" />
                    Hashtags ({form.hashtags.length})
                  </label>
                  <input
                    type="text"
                    onKeyDown={addHashtag}
                    placeholder="Type and press Enter to add..."
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-pink/20 focus:border-brand-pink text-sm mb-2"
                  />
                  {form.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {form.hashtags.map((tag, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-neutral-100 text-neutral-600 text-xs rounded-full"
                        >
                          #{tag}
                          <button
                            onClick={() => removeHashtag(i)}
                            className="text-neutral-400 hover:text-neutral-600"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Media URLs */}
                <div className="bg-white rounded-xl border border-neutral-200 p-4">
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Media URLs
                  </label>
                  {form.mediaUrls.map((url, index) => (
                    <div key={index} className="flex gap-2 mb-2">
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => updateMediaUrl(index, e.target.value)}
                        placeholder="https://example.com/image.jpg"
                        className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-pink/20 focus:border-brand-pink text-sm"
                      />
                      {form.mediaUrls.length > 0 && (
                        <button
                          onClick={() => removeMediaUrl(index)}
                          className="p-2 text-neutral-400 hover:text-red-500"
                        >
                          <XMarkIcon className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={addMediaUrl}
                    className="text-sm text-brand-pink hover:text-brand-pink/80"
                  >
                    + Add media URL
                  </button>
                </div>
              </>
            ) : (
              /* Preview Tab */
              <div className="bg-white rounded-xl border border-neutral-200 p-6">
                <div className="max-w-md mx-auto">
                  {/* Instagram Post Mock */}
                  <div className="border border-neutral-200 rounded-lg overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center gap-3 p-3 border-b">
                      <div className="w-8 h-8 bg-gradient-to-br from-brand-pink to-brand-orange rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-bold">AE</span>
                      </div>
                      <span className="text-sm font-medium">acmeops</span>
                    </div>

                    {/* Media */}
                    {form.mediaUrls.length > 0 && form.mediaUrls[0] ? (
                      <div className="aspect-square bg-neutral-100 flex items-center justify-center">
                        <img
                          src={form.mediaUrls[0]}
                          alt="Preview"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.parentElement.innerHTML = '<div class="text-neutral-400 text-sm">Image preview unavailable</div>';
                          }}
                        />
                      </div>
                    ) : (
                      <div className="aspect-square bg-neutral-100 flex items-center justify-center">
                        <PhotoIcon className="h-16 w-16 text-neutral-300" />
                      </div>
                    )}

                    {/* Caption */}
                    <div className="p-3">
                      <p className="text-sm whitespace-pre-wrap">
                        <span className="font-medium">acmeops</span>{' '}
                        {fullCaption || <span className="text-neutral-400">No caption</span>}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Save Button */}
            {['draft', 'pending_review'].includes(post.status) && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full px-4 py-2 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            )}

            {/* Scheduling */}
            {['draft', 'approved'].includes(post.status) && (
              <div className="bg-white rounded-xl border border-neutral-200 p-4">
                <h3 className="text-sm font-medium text-neutral-900 mb-3">Schedule</h3>
                <input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(e) => setForm(prev => ({ ...prev, scheduledAt: e.target.value }))}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm mb-2"
                />
                <button
                  onClick={handleSchedule}
                  disabled={!form.scheduledAt}
                  className="w-full px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <CalendarDaysIcon className="h-4 w-4 inline mr-1" />
                  Schedule Post
                </button>
              </div>
            )}

            {/* Workflow Actions */}
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <h3 className="text-sm font-medium text-neutral-900 mb-3">Actions</h3>
              <div className="space-y-2">
                {post.status === 'draft' && (
                  <button
                    onClick={handleSubmitForReview}
                    className="w-full px-3 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600"
                  >
                    <ClockIcon className="h-4 w-4 inline mr-1" />
                    Submit for Review
                  </button>
                )}

                {post.status === 'pending_review' && (
                  <>
                    <button
                      onClick={handleApprove}
                      className="w-full px-3 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600"
                    >
                      <CheckCircleIcon className="h-4 w-4 inline mr-1" />
                      Approve
                    </button>
                    <button
                      onClick={handleReject}
                      className="w-full px-3 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600"
                    >
                      <XMarkIcon className="h-4 w-4 inline mr-1" />
                      Reject
                    </button>
                  </>
                )}

                {['approved', 'scheduled'].includes(post.status) && apiStatus.enabled && (
                  <button
                    onClick={handlePublish}
                    disabled={publishing}
                    className="w-full px-3 py-2 bg-gradient-to-r from-brand-pink to-brand-orange text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
                  >
                    {publishing ? (
                      'Publishing...'
                    ) : (
                      <>
                        <ArrowUpOnSquareIcon className="h-4 w-4 inline mr-1" />
                        Publish Now
                      </>
                    )}
                  </button>
                )}

                {['approved', 'scheduled'].includes(post.status) && !apiStatus.enabled && (
                  <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                    Instagram API not configured. Publishing disabled.
                  </div>
                )}
              </div>
            </div>

            {/* Post Info */}
            <div className="bg-neutral-50 rounded-xl p-4 text-xs text-neutral-500">
              <p>Created: {new Date(post.created_at).toLocaleString()}</p>
              <p>Updated: {new Date(post.updated_at).toLocaleString()}</p>
              {post.scheduled_at && (
                <p>Scheduled: {new Date(post.scheduled_at).toLocaleString()}</p>
              )}
              {post.published_at && (
                <p>Published: {new Date(post.published_at).toLocaleString()}</p>
              )}
            </div>
          </div>
        </div>
      </div>
      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
        onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
        title={confirmState.title}
        message={confirmState.message}
      />
      <AlertDialog isOpen={alertState.isOpen} onClose={() => setAlertState(s => ({ ...s, isOpen: false }))} title={alertState.title} message={alertState.message} />
      <PromptDialog
        isOpen={promptState.isOpen}
        onClose={() => setPromptState(s => ({ ...s, isOpen: false }))}
        onSubmit={(val) => promptState.onSubmit?.(val)}
        title={promptState.title}
        message={promptState.message}
        placeholder={promptState.placeholder}
        defaultValue={promptState.defaultValue || ''}
      />
    </>
  );
}
