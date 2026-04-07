import { useState } from 'react';
import { useRole } from '../contexts/RoleContext';

export default function PostReactionButton({ post }) {
  const [reacted, setReacted] = useState(post.user_reacted || false);
  const [reactionCount, setReactionCount] = useState(post.reaction_count || 0);
  const [loading, setLoading] = useState(false);

  const handleReaction = async () => {
    if (loading) return;
    
    setLoading(true);
    try {
      if (reacted) {
        // Remove reaction
        const response = await fetch(`/api/news-feed/posts/${post.id}/reactions`, {
          method: 'DELETE',
          credentials: 'include',
        });

        if (response.ok) {
          setReacted(false);
          setReactionCount(Math.max(0, reactionCount - 1));
        }
      } else {
        // Add reaction
        const response = await fetch(`/api/news-feed/posts/${post.id}/reactions`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reaction_type: 'like' })
        });
        
        if (response.ok) {
          setReacted(true);
          setReactionCount(reactionCount + 1);
        }
      }
    } catch (error) {
      console.error('Error toggling reaction:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleReaction}
      disabled={loading}
      className={`flex items-center gap-1 text-xs sm:text-sm min-h-[44px] sm:min-h-0 px-2 sm:px-0 transition-colors ${
        reacted
          ? 'text-brand-purple font-medium'
          : 'text-neutral-600 hover:text-brand-purple'
      }`}
    >
      <span>👍</span>
      <span>{reactionCount}</span>
    </button>
  );
}

