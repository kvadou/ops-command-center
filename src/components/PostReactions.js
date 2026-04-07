import { useState, useRef, useEffect } from 'react';
import { HandThumbUpIcon, HeartIcon, FaceSmileIcon } from '@heroicons/react/24/solid';
import { HandThumbUpIcon as HandThumbUpOutlineIcon } from '@heroicons/react/24/outline';

const REACTION_TYPES = [
  { type: 'like', emoji: '👍', label: 'Like', icon: HandThumbUpIcon },
  { type: 'love', emoji: '❤️', label: 'Love', icon: HeartIcon },
  { type: 'laugh', emoji: '😂', label: 'Haha', icon: FaceSmileIcon },
  { type: 'wow', emoji: '😮', label: 'Wow' },
  { type: 'sad', emoji: '😢', label: 'Sad' },
  { type: 'angry', emoji: '😡', label: 'Angry' }
];

export default function PostReactions({ post, onReactionUpdate }) {
  const [showPicker, setShowPicker] = useState(false);
  const [userReaction, setUserReaction] = useState(null);
  const [reactions, setReactions] = useState({});
  const [totalCount, setTotalCount] = useState(post.reaction_count || 0);
  const pickerRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    // Fetch reaction breakdown and user reaction
    fetchReactions();
  }, [post.id]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setShowPicker(false);
      }
    };

    if (showPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showPicker]);

  const fetchReactions = async () => {
    try {
      const response = await fetch(`/api/news-feed/posts/${post.id}/reactions`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        // Group reactions by type
        const grouped = {};
        let total = 0;
        data.reactions?.forEach(r => {
          grouped[r.reaction_type] = (grouped[r.reaction_type] || 0) + parseInt(r.count);
          total += parseInt(r.count);
        });
        setReactions(grouped);
        setTotalCount(total);
        
        // Set user's reaction if they have one
        if (data.user_reaction) {
          setUserReaction(data.user_reaction.reaction_type);
        }
      }
    } catch (error) {
      console.error('Error fetching reactions:', error);
    }
  };

  const handleReaction = async (reactionType) => {
    try {
      // If clicking the same reaction, remove it
      if (userReaction === reactionType) {
        const response = await fetch(`/api/news-feed/posts/${post.id}/reactions`, {
          method: 'DELETE',
          credentials: 'include',
        });

        if (response.ok) {
          setUserReaction(null);
          setTotalCount(Math.max(0, totalCount - 1));
          setReactions(prev => ({
            ...prev,
            [reactionType]: Math.max(0, (prev[reactionType] || 0) - 1)
          }));
          onReactionUpdate?.();
        }
      } else {
        // Add or change reaction
        const response = await fetch(`/api/news-feed/posts/${post.id}/reactions`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reaction_type: reactionType })
        });
        
        if (response.ok) {
          const oldReaction = userReaction;
          setUserReaction(reactionType);
          
          // Update counts
          if (oldReaction) {
            setReactions(prev => ({
              ...prev,
              [oldReaction]: Math.max(0, (prev[oldReaction] || 0) - 1),
              [reactionType]: (prev[reactionType] || 0) + 1
            }));
          } else {
            setTotalCount(totalCount + 1);
            setReactions(prev => ({
              ...prev,
              [reactionType]: (prev[reactionType] || 0) + 1
            }));
          }
          onReactionUpdate?.();
        }
      }
      
      setShowPicker(false);
    } catch (error) {
      console.error('Error toggling reaction:', error);
    }
  };

  const getReactionSummary = () => {
    const types = Object.keys(reactions).filter(type => reactions[type] > 0);
    if (types.length === 0) return null;
    
    const emojis = types.map(type => {
      const reaction = REACTION_TYPES.find(r => r.type === type);
      return reaction?.emoji || '👍';
    }).join('');
    
    return emojis;
  };

  const getReactionLabel = () => {
    if (userReaction) {
      const reaction = REACTION_TYPES.find(r => r.type === userReaction);
      return reaction?.label || 'Like';
    }
    return 'Like';
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onMouseEnter={() => setShowPicker(true)}
        onMouseLeave={() => {
          // Delay closing to allow moving to picker
          setTimeout(() => {
            if (!pickerRef.current?.matches(':hover')) {
              setShowPicker(false);
            }
          }, 200);
        }}
        onClick={() => {
          if (!userReaction) {
            handleReaction('like');
          } else {
            handleReaction(userReaction);
          }
        }}
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors ${
          userReaction
            ? 'bg-blue-50 text-blue-600'
            : 'text-neutral-600 hover:bg-neutral-100'
        }`}
      >
        {userReaction ? (
          <span className="text-xl">
            {REACTION_TYPES.find(r => r.type === userReaction)?.emoji || '👍'}
          </span>
        ) : (
          <HandThumbUpOutlineIcon className="h-5 w-5" />
        )}
      </button>

      {showPicker && (
        <div
          ref={pickerRef}
          onMouseEnter={() => setShowPicker(true)}
          onMouseLeave={() => setShowPicker(false)}
          className="absolute bottom-full left-0 mb-2 bg-white border border-neutral-200 rounded-full shadow-lg px-2 py-1 flex items-center gap-1 z-50"
        >
          {REACTION_TYPES.map((reaction) => (
            <button
              key={reaction.type}
              onClick={() => handleReaction(reaction.type)}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.3)';
                e.currentTarget.style.transition = 'transform 0.2s';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
              className="text-2xl hover:scale-150 transition-transform cursor-pointer"
              title={reaction.label}
            >
              {reaction.emoji}
            </button>
          ))}
        </div>
      )}

    </div>
  );
}

