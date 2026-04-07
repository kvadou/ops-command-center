import { useState, useEffect } from 'react';
import {
  ChatBubbleLeftIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import ConfirmationModal from './ConfirmationModal';

/**
 * KnowledgeComments - Public comment thread component
 * All comments are visible to all users (franchisor and franchisees)
 */
export default function KnowledgeComments({ articleId }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [editingComment, setEditingComment] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });

  useEffect(() => {
    fetchComments();
  }, [articleId]);

  const fetchComments = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/knowledge/comments?article_id=${articleId}`, {
        credentials: 'include',
      });

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!newComment.trim()) {
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/knowledge/comments', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          article_id: articleId,
          content: newComment
        })
      });

      if (response.ok) {
        const data = await response.json();
        setComments([...comments, data.comment]);
        setNewComment('');
      }
    } catch (error) {
      console.error('Error posting comment:', error);
      // Error already logged to console
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (commentId) => {
    if (!editContent.trim()) {
      return;
    }

    try {
      const response = await fetch(`/api/knowledge/comments/${commentId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: editContent
        })
      });

      if (response.ok) {
        const data = await response.json();
        setComments(comments.map(c => c.id === commentId ? data.comment : c));
        setEditingComment(null);
        setEditContent('');
      }
    } catch (error) {
      console.error('Error editing comment:', error);
      // Error already logged to console
    }
  };

  const handleDelete = (commentId) => {
    setConfirmState({
      isOpen: true,
      action: async () => {
        try {
          const response = await fetch(`/api/knowledge/comments/${commentId}`, {
            method: 'DELETE',
            credentials: 'include',
          });

          if (response.ok) {
            setComments(comments.filter(c => c.id !== commentId));
          }
        } catch (error) {
          console.error('Error deleting comment:', error);
        }
      },
      title: 'Delete Comment',
      message: 'Are you sure you want to delete this comment?',
    });
  };

  const startEdit = (comment) => {
    setEditingComment(comment.id);
    setEditContent(comment.content);
  };

  const cancelEdit = () => {
    setEditingComment(null);
    setEditContent('');
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const currentUserId = JSON.parse(localStorage.getItem('user') || '{}')?.id;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
      <div className="flex items-center gap-2 mb-6">
        <ChatBubbleLeftIcon className="h-6 w-6 text-brand-purple" />
        <h3 className="text-lg font-semibold text-neutral-900">
          Comments ({comments.length})
        </h3>
      </div>

      {/* New Comment Form */}
      <form onSubmit={handleSubmit} className="mb-6">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          rows={3}
          className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent resize-none"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="submit"
            disabled={submitting || !newComment.trim()}
            className="px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Posting...' : 'Post Comment'}
          </button>
        </div>
      </form>

      {/* Comments List */}
      {loading ? (
        <div className="text-center py-8 text-neutral-500">
          <p>Loading comments...</p>
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-8 px-4 bg-gradient-to-br from-brand-light/30 to-white rounded-lg border border-neutral-100">
          <ChatBubbleLeftIcon className="mx-auto h-12 w-12 text-neutral-400 mb-3" />
          <p className="text-sm font-medium text-neutral-700">No comments yet</p>
          <p className="text-sm text-neutral-500 mt-1">
            Be the first to comment on this article!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="bg-neutral-50 rounded-lg p-4 border border-neutral-200"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <p className="text-sm font-medium text-neutral-900">
                    {comment.user_name || 'Anonymous'}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {formatDate(comment.created_at)}
                    {comment.is_edited && ' (edited)'}
                  </p>
                </div>

                {comment.user_id === currentUserId && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startEdit(comment)}
                      className="p-1 text-neutral-600 hover:text-brand-purple transition-colors"
                      title="Edit"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="p-1 text-neutral-600 hover:text-red-600 transition-colors"
                      title="Delete"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {editingComment === comment.id ? (
                <div>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent resize-none text-sm"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => handleEdit(comment.id)}
                      className="px-3 py-1 bg-brand-purple text-white text-sm rounded hover:bg-brand-navy transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="px-3 py-1 bg-neutral-200 text-neutral-700 text-sm rounded hover:bg-neutral-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-neutral-700 whitespace-pre-wrap">
                  {comment.content}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
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

