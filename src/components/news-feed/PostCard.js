/**
 * PostCard - Individual Post Display Component
 * 
 * Displays a single post with all its features:
 * - Rich content rendering
 * - Media gallery
 * - Polls
 * - Events
 * - Reactions
 * - Comments
 */

import React, { useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { Link } from 'react-router-dom';
import {
  EllipsisHorizontalIcon,
  ChatBubbleLeftIcon,
  ShareIcon,
  BookmarkIcon,
  FlagIcon,
  PencilIcon,
  TrashIcon,
  MapPinIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';
import { BookmarkIcon as BookmarkIconSolid } from '@heroicons/react/24/solid';
import MediaGallery from './MediaGallery';
import PollDisplay from './PollDisplay';
import EventCard from './EventCard';
import LinkPreview from './LinkPreview';
import PostReactions from '../PostReactions';
import PostComments from '../PostComments';

// Visibility badges
const VISIBILITY_BADGES = {
  hq_only: { label: 'HQ Only', color: 'bg-red-100 text-red-700' },
  internal: { label: 'Internal', color: 'bg-blue-100 text-blue-700' },
  franchisees: { label: 'Franchisees', color: 'bg-purple-100 text-purple-700' },
  tutors: { label: 'Tutors', color: 'bg-green-100 text-green-700' },
  parents: { label: 'Parents', color: 'bg-orange-100 text-orange-700' },
  public: { label: 'Public', color: 'bg-neutral-100 text-neutral-700' },
};

const PostCard = ({
  post,
  currentUserId,
  currentRole = 'admin',
  onEdit,
  onDelete,
  onPin,
  onReport,
  onReactionUpdate,
  onCommentUpdate,
  showFullContent = false,
  compact = false,
}) => {
  const [showActions, setShowActions] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [contentExpanded, setContentExpanded] = useState(showFullContent);

  // Check if current user is author or admin
  const isAuthor = currentUserId === post.author_id || 
                   currentUserId === post.author_email;
  const isAdmin = ['admin', 'staff'].includes(currentRole);
  const canModerate = isAdmin;

  // Format time ago
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
    return date.toLocaleDateString();
  };

  // Get author display name
  const getAuthorName = () => {
    if (post.author_first_name && post.author_last_name) {
      return `${post.author_first_name} ${post.author_last_name}`;
    }
    if (post.author_email) {
      return post.author_email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    return 'Unknown';
  };

  // Get author initials for avatar
  const getAuthorInitials = () => {
    const name = getAuthorName();
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Parse media URLs
  const mediaUrls = Array.isArray(post.media_urls) 
    ? post.media_urls 
    : (typeof post.media_urls === 'string' ? JSON.parse(post.media_urls || '[]') : []);

  // Check if content should be truncated
  const shouldTruncate = !contentExpanded && post.content && post.content.length > 300;
  const displayContent = shouldTruncate 
    ? post.content.substring(0, 300) + '...' 
    : post.content;

  // Render content with mentions highlighted
  const renderContent = (text) => {
    if (!text) return null;
    
    // Simple mention highlighting
    const parts = text.split(/(@\w+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        return (
          <span key={index} className="text-brand-purple font-medium">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const visibilityBadge = VISIBILITY_BADGES[post.visibility_level];

  return (
    <article className={`bg-white rounded-xl shadow-sm border border-neutral-200 ${compact ? 'p-3' : 'p-4 sm:p-6'}`}>
      {/* Pinned indicator */}
      {post.is_pinned && (
        <div className="flex items-center gap-1 text-xs text-brand-purple font-medium mb-3 pb-2 border-b border-neutral-100">
          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10.5 3.5a.5.5 0 00-1 0v3.793L7.354 5.146a.5.5 0 10-.708.708L9 8.207V13.5H7.5a.5.5 0 000 1h5a.5.5 0 000-1H11V8.207l2.354-2.353a.5.5 0 00-.708-.708L10.5 7.293V3.5z"/>
          </svg>
          <span>Pinned post</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Author Avatar */}
        <div className={`${compact ? 'w-10 h-10' : 'w-12 h-12'} rounded-full bg-brand-purple flex items-center justify-center text-white font-semibold flex-shrink-0`}>
          {post.author_image_url ? (
            <img
              src={post.author_image_url}
              alt={getAuthorName()}
              className="w-full h-full rounded-full object-cover"
              loading="lazy"
            />
          ) : (
            <span className={compact ? 'text-sm' : 'text-base'}>{getAuthorInitials()}</span>
          )}
        </div>

        {/* Author Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`${compact ? 'text-sm' : 'text-base'} font-semibold text-neutral-900`}>
              {getAuthorName()}
            </span>
            {visibilityBadge && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${visibilityBadge.color}`}>
                {visibilityBadge.label}
              </span>
            )}
            {post.is_announcement && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-brand-purple text-white">
                Announcement
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500 mt-0.5">
            <span>{formatTimeAgo(post.created_at)}</span>
            {post.location_tag && (
              <>
                <span>•</span>
                <span className="flex items-center gap-0.5">
                  <MapPinIcon className="h-3 w-3" />
                  {post.location_tag}
                </span>
              </>
            )}
            {post.updated_at && post.updated_at !== post.created_at && (
              <>
                <span>•</span>
                <span className="text-neutral-400">edited</span>
              </>
            )}
          </div>
        </div>

        {/* Actions Menu */}
        <div className="relative">
          <button
            onClick={() => setShowActions(!showActions)}
            className="p-2 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <EllipsisHorizontalIcon className="h-5 w-5" />
          </button>

          {showActions && (
            <>
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setShowActions(false)}
              />
              <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-neutral-200 z-20 overflow-hidden">
                {isAuthor && (
                  <>
                    <button
                      onClick={() => {
                        onEdit?.(post);
                        setShowActions(false);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                    >
                      <PencilIcon className="h-4 w-4" />
                      Edit post
                    </button>
                    <button
                      onClick={() => {
                        onDelete?.(post.id);
                        setShowActions(false);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <TrashIcon className="h-4 w-4" />
                      Delete post
                    </button>
                  </>
                )}
                {canModerate && !isAuthor && (
                  <>
                    <button
                      onClick={() => {
                        onPin?.(post.id, !post.is_pinned);
                        setShowActions(false);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                    >
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10.5 3.5a.5.5 0 00-1 0v3.793L7.354 5.146a.5.5 0 10-.708.708L9 8.207V13.5H7.5a.5.5 0 000 1h5a.5.5 0 000-1H11V8.207l2.354-2.353a.5.5 0 00-.708-.708L10.5 7.293V3.5z"/>
                      </svg>
                      {post.is_pinned ? 'Unpin post' : 'Pin post'}
                    </button>
                    <button
                      onClick={() => {
                        onDelete?.(post.id);
                        setShowActions(false);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <TrashIcon className="h-4 w-4" />
                      Remove post
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    setIsBookmarked(!isBookmarked);
                    setShowActions(false);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  {isBookmarked ? (
                    <BookmarkIconSolid className="h-4 w-4 text-brand-purple" />
                  ) : (
                    <BookmarkIcon className="h-4 w-4" />
                  )}
                  {isBookmarked ? 'Remove bookmark' : 'Bookmark'}
                </button>
                {!isAuthor && (
                  <button
                    onClick={() => {
                      onReport?.(post.id);
                      setShowActions(false);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 border-t border-neutral-100"
                  >
                    <FlagIcon className="h-4 w-4" />
                    Report post
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className={`mt-3 ${compact ? 'text-sm' : ''}`}>
        {/* Text Content */}
        {post.content && (
          <div className="text-neutral-800 whitespace-pre-wrap leading-relaxed">
            {post.content_html ? (
              <div 
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(displayContent) }}
              />
            ) : (
              <p>{renderContent(displayContent)}</p>
            )}
            {shouldTruncate && (
              <button
                onClick={() => setContentExpanded(true)}
                className="text-brand-purple hover:text-brand-navy font-medium text-sm mt-1"
              >
                See more
              </button>
            )}
          </div>
        )}

        {/* Media Gallery */}
        {mediaUrls.length > 0 && (
          <div className="mt-3">
            <MediaGallery media={mediaUrls} />
          </div>
        )}

        {/* Poll */}
        {post.poll_data && (
          <div className="mt-3">
            <PollDisplay
              postId={post.id}
              pollData={post.poll_data}
              currentUserId={currentUserId}
            />
          </div>
        )}

        {/* Event */}
        {post.event_data && (
          <div className="mt-3">
            <EventCard eventData={post.event_data} />
          </div>
        )}

        {/* Link Preview */}
        {post.link_preview && (
          <div className="mt-3">
            <LinkPreview preview={post.link_preview} />
          </div>
        )}
      </div>

      {/* Engagement Bar */}
      <div className="mt-4 flex items-center justify-between text-sm text-neutral-500 border-t border-neutral-100 pt-3">
        <PostReactions
          post={post}
          onReactionUpdate={onReactionUpdate}
        />
        
        <button
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-1.5 text-neutral-600 hover:text-neutral-900 transition-colors"
        >
          <ChatBubbleLeftIcon className="h-5 w-5" />
          <span>{post.comment_count || 0}</span>
        </button>

        <button className="flex items-center gap-1.5 text-neutral-600 hover:text-neutral-900 transition-colors">
          <ShareIcon className="h-5 w-5" />
          <span className="hidden sm:inline">Share</span>
        </button>
      </div>

      {/* Comments Section */}
      {showComments && (
        <div className="mt-3 pt-3 border-t border-neutral-100">
          <PostComments
            post={post}
            onCommentUpdate={onCommentUpdate}
          />
        </div>
      )}
    </article>
  );
};

export default PostCard;

