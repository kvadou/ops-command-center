import { useState, useEffect, useRef } from 'react';
import { 
  FaceSmileIcon, 
  PaperClipIcon,
  PhotoIcon
} from '@heroicons/react/24/outline';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';
import EmojiPicker from './EmojiPicker';

export default function PostComments({ post, onCommentUpdate }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const emojiPickerRef = useRef(null);
  const commentInputRef = useRef(null);

  useEffect(() => {
    fetchCurrentUser();
    if (showComments) {
      fetchComments();
    }
  }, [post.id, showComments]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showEmojiPicker]);

  const fetchCurrentUser = async () => {
    try {
      const response = await fetch('/api/me', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setCurrentUser(data.user || data);
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
    }
  };

  const fetchComments = async () => {
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
        onCommentUpdate?.(post.id, (post.comment_count || 0) + 1);
      }
    } catch (error) {
      console.error('Error posting comment:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmojiSelect = (emoji) => {
    const cursorPos = commentInputRef.current?.selectionStart || commentText.length;
    const before = commentText.substring(0, cursorPos);
    const after = commentText.substring(cursorPos);
    setCommentText(before + emoji + after);
    setShowEmojiPicker(false);
    
    setTimeout(() => {
      if (commentInputRef.current) {
        const newPos = cursorPos + emoji.length;
        commentInputRef.current.focus();
        commentInputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return new Date(dateString).toLocaleDateString();
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

  const getUserInitials = () => {
    if (currentUser?.first_name) {
      return currentUser.first_name[0].toUpperCase();
    }
    if (currentUser?.email) {
      return currentUser.email[0].toUpperCase();
    }
    return 'U';
  };

  return (
    <div className="mt-3 border-t border-neutral-200 pt-3">
      {/* View Comments Button */}
      {!showComments && (post.comment_count || 0) > 0 && (
        <button
          onClick={() => setShowComments(true)}
          className="text-sm text-neutral-600 hover:text-neutral-900 mb-3"
        >
          View all {post.comment_count} {post.comment_count === 1 ? 'comment' : 'comments'}
        </button>
      )}

      {/* Comments List */}
      {showComments && (
        <div className="space-y-3 mb-3 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="text-center py-4 text-neutral-500 text-sm">
              Loading comments...
            </div>
          ) : comments.length > 0 && (
            comments.map((comment) => (
              <div key={comment.id} className="flex gap-2">
                <div className="w-8 h-8 rounded-full bg-brand-purple flex items-center justify-center text-white text-xs flex-shrink-0">
                  {(comment.author_first_name?.[0] || comment.author_email?.[0] || 'U').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="bg-neutral-100 rounded-2xl px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-neutral-900">
                        {getAuthorName(comment)}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {formatTimeAgo(comment.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-700 whitespace-pre-wrap">{comment.content}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Comment Input */}
      <form onSubmit={handleSubmitComment} className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-full bg-brand-purple flex items-center justify-center text-white text-xs flex-shrink-0">
          {getUserInitials()}
        </div>
        <div className="flex-1 relative">
          <div className="flex items-center gap-1 bg-neutral-100 rounded-2xl px-3 py-2">
            <input
              ref={commentInputRef}
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Write a comment..."
              className="flex-1 bg-transparent border-0 focus:outline-none text-sm text-neutral-900 placeholder-neutral-500"
              disabled={submitting}
              onFocus={() => setShowComments(true)}
            />
            <div className="flex items-center gap-1">
              <div className="relative" ref={emojiPickerRef}>
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="p-1 text-neutral-500 hover:text-neutral-700"
                >
                  <FaceSmileIcon className="h-5 w-5" />
                </button>
                {showEmojiPicker && (
                  <div className="absolute bottom-full right-0 mb-2">
                    <EmojiPicker
                      onEmojiSelect={handleEmojiSelect}
                      onClose={() => setShowEmojiPicker(false)}
                    />
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={submitting || !commentText.trim()}
                className="p-1 text-brand-purple hover:text-brand-navy disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <PaperAirplaneIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

