import { useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export default function PostCommentButton({ post }) {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = async () => {
    if (comments.length > 0) return; // Already loaded
    
    setLoading(true);
    try {
      const response = await fetch(`/api/news-feed/posts/${post.id}/comments`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setComments(data.comments || []);
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setShowComments(true);
    fetchComments();
  };

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim() || submitting) return;

    setSubmitting(true);
    try {
      const response = await fetch(`/api/news-feed/posts/${post.id}/comments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentText.trim() })
      });

      if (response.ok) {
        const data = await response.json();
        setComments([...comments, data.comment]);
        setCommentText('');
      }
    } catch (error) {
      console.error('Error posting comment:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getAuthorName = (comment) => {
    if (comment.author_first_name && comment.author_last_name) {
      return `${comment.author_first_name} ${comment.author_last_name}`;
    }
    if (comment.author_email) {
      return comment.author_email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    return 'Unknown';
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-1 text-xs sm:text-sm text-neutral-600 hover:text-brand-purple min-h-[44px] sm:min-h-0 px-2 sm:px-0 transition-colors"
      >
        <span>💬</span>
        <span>{post.comment_count || 0}</span>
      </button>

      <Transition appear show={showComments} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setShowComments(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-xl bg-white shadow-xl transition-all">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
                    <Dialog.Title className="text-lg font-semibold text-neutral-900">
                      Comments
                    </Dialog.Title>
                    <button
                      onClick={() => setShowComments(false)}
                      className="text-neutral-400 hover:text-neutral-500 focus:outline-none"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="max-h-96 overflow-y-auto px-6 py-4">
                    {loading ? (
                      <div className="text-center py-8 text-neutral-500">
                        <p className="text-sm">Loading comments...</p>
                      </div>
                    ) : comments.length === 0 ? (
                      <div className="text-center py-8 text-neutral-500">
                        <p className="text-sm">No comments yet. Be the first to comment!</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {comments.map((comment) => (
                          <div key={comment.id} className="flex gap-3">
                            <img
                              src={comment.author_image_url || "/logo512.png"}
                              alt={getAuthorName(comment)}
                              className="w-8 h-8 rounded-full object-contain bg-brand-light flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-semibold text-neutral-900">
                                  {getAuthorName(comment)}
                                </span>
                                <span className="text-xs text-neutral-500">
                                  {formatTimeAgo(comment.created_at)}
                                </span>
                              </div>
                              <p className="text-sm text-neutral-700">{comment.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleSubmitComment} className="px-6 py-4 border-t border-neutral-200">
                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="Write a comment..."
                        className="flex-1 px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
                        disabled={submitting}
                      />
                      <button
                        type="submit"
                        disabled={submitting || !commentText.trim()}
                        className="px-4 py-2 text-sm font-medium text-white bg-brand-purple rounded-lg hover:bg-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-purple focus:ring-offset-2 disabled:opacity-50"
                      >
                        {submitting ? 'Posting...' : 'Post'}
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
}

