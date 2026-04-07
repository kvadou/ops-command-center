import React, { useState } from 'react';
import { 
  HeartIcon, 
  FaceSmileIcon,
  PencilIcon,
  TrashIcon,
  ArrowUturnLeftIcon
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartIconSolid } from '@heroicons/react/24/solid';
import RichTextCommentEditor from './RichTextCommentEditor';
import ConfirmationModal from '../ConfirmationModal';

const EMOJI_REACTIONS = ['👍', '❤️', '😄', '🎉', '👏', '🔥'];

export default function CommentThread({ 
  comment, 
  onEdit, 
  onDelete, 
  onReply,
  onReact,
  currentUserId,
  users = []
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });

  const canEdit = comment.author_id === currentUserId;
  const canDelete = comment.author_id === currentUserId;

  const handleEdit = (newContent) => {
    onEdit(comment.id, newContent);
    setIsEditing(false);
  };

  const handleReply = (content) => {
    onReply(comment.id, content);
    setIsReplying(false);
  };

  const handleReaction = (emoji) => {
    onReact(comment.id, emoji);
    setShowReactions(false);
  };

  const parseMentions = (text) => {
    // Simple mention parsing - @username
    const parts = [];
    let lastIndex = 0;
    const mentionRegex = /@(\w+)/g;
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.substring(lastIndex, match.index) });
      }
      parts.push({ type: 'mention', content: match[0], user: match[1] });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.substring(lastIndex) });
    }

    return parts.length > 0 ? parts : [{ type: 'text', content: text }];
  };

  const renderContent = () => {
    const parts = parseMentions(comment.content);
    return (
      <div className="text-sm text-neutral-700 leading-relaxed">
        {parts.map((part, index) => {
          if (part.type === 'mention') {
            return (
              <span key={index} className="text-brand-purple font-medium">
                {part.content}
              </span>
            );
          }
          return <span key={index}>{part.content}</span>;
        })}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="bg-neutral-50 rounded-lg p-3 hover:bg-neutral-100 transition-colors">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-brand-purple/20 flex items-center justify-center text-brand-purple font-medium text-xs flex-shrink-0">
            {(comment.author_first_name?.[0] || comment.author_email?.[0] || 'U').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-neutral-900">
                {comment.author_first_name || comment.author_email}
              </span>
              <span className="text-xs text-neutral-500">
                {new Date(comment.created_at).toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
              {comment.updated_at && comment.updated_at !== comment.created_at && (
                <span className="text-xs text-neutral-400 italic">(edited)</span>
              )}
            </div>
            {isEditing ? (
              <RichTextCommentEditor
                initialValue={comment.content}
                onSubmit={handleEdit}
                onCancel={() => setIsEditing(false)}
                users={users}
              />
            ) : (
              <>
                {renderContent()}
                <div className="flex items-center gap-3 mt-2">
                  <div className="relative">
                    <button
                      onClick={() => setShowReactions(!showReactions)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200 rounded"
                    >
                      <FaceSmileIcon className="h-4 w-4" />
                      <span>React</span>
                    </button>
                    {showReactions && (
                      <div className="absolute bottom-full left-0 mb-2 bg-white border border-neutral-200 rounded-lg shadow-lg p-2 flex items-center gap-1 z-10">
                        {EMOJI_REACTIONS.map(emoji => (
                          <button
                            key={emoji}
                            onClick={() => handleReaction(emoji)}
                            className="text-xl hover:scale-125 transition-transform p-1"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setIsReplying(true)}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200 rounded"
                  >
                    <ArrowUturnLeftIcon className="h-4 w-4" />
                    <span>Reply</span>
                  </button>
                  {canEdit && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200 rounded"
                    >
                      <PencilIcon className="h-4 w-4" />
                      <span>Edit</span>
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => {
                        setConfirmState({
                          isOpen: true,
                          title: 'Delete Comment',
                          message: 'Are you sure you want to delete this comment?',
                          action: () => onDelete(comment.id)
                        });
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                    >
                      <TrashIcon className="h-4 w-4" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
                {comment.reactions && comment.reactions.length > 0 && (
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {Object.entries(
                      comment.reactions.reduce((acc, r) => {
                        acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                        return acc;
                      }, {})
                    ).map(([emoji, count]) => (
                      <span key={emoji} className="px-2 py-0.5 bg-white border border-neutral-200 rounded text-xs">
                        {emoji} {count}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-11 space-y-2 border-l-2 border-neutral-200 pl-4">
          {comment.replies.map(reply => (
            <CommentThread
              key={reply.id}
              comment={reply}
              onEdit={onEdit}
              onDelete={onDelete}
              onReply={onReply}
              onReact={onReact}
              currentUserId={currentUserId}
              users={users}
            />
          ))}
        </div>
      )}

      {/* Reply Editor */}
      {isReplying && (
        <div className="ml-11 mt-2">
          <RichTextCommentEditor
            onSubmit={handleReply}
            onCancel={() => setIsReplying(false)}
            placeholder="Write a reply..."
            users={users}
          />
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
        onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
        title={confirmState.title}
        message={confirmState.message}
      />
    </div>
  );
}
