import React, { useState, useRef, useEffect } from 'react';
import { PaperAirplaneIcon, AtSymbolIcon } from '@heroicons/react/24/outline';

export default function RichTextCommentEditor({ 
  onSubmit, 
  onCancel, 
  placeholder = 'Add a comment...',
  users = [],
  initialValue = ''
}) {
  const [content, setContent] = useState(initialValue);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(-1);
  const textareaRef = useRef(null);
  const [cursorPosition, setCursorPosition] = useState(0);

  useEffect(() => {
    if (textareaRef.current && initialValue) {
      textareaRef.current.value = initialValue;
    }
  }, [initialValue]);

  const handleInput = (e) => {
    const value = e.target.value;
    setContent(value);
    const cursorPos = e.target.selectionStart;
    setCursorPosition(cursorPos);

    // Check for @ mention
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      const spaceIndex = textAfterAt.indexOf(' ');
      
      if (spaceIndex === -1 || textAfterAt.length < 20) {
        // Still typing mention
        setMentionQuery(textAfterAt);
        setMentionIndex(lastAtIndex);
        setShowMentions(true);
        return;
      }
    }
    
    setShowMentions(false);
  };

  const handleKeyDown = (e) => {
    if (showMentions && mentionQuery) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        // Handle mention selection (simplified for now)
        if (e.key === 'Escape') {
          setShowMentions(false);
        }
      }
    }
  };

  const insertMention = (user) => {
    const textBefore = content.substring(0, mentionIndex);
    const textAfter = content.substring(cursorPosition);
    const newContent = `${textBefore}@${user.first_name || user.email} ${textAfter}`;
    setContent(newContent);
    setShowMentions(false);
    setMentionQuery('');
    
    if (textareaRef.current) {
      textareaRef.current.focus();
      const newCursorPos = mentionIndex + `@${user.first_name || user.email} `.length;
      textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
    }
  };

  const filteredUsers = users.filter(user => {
    if (!mentionQuery) return false;
    const name = (user.first_name || '').toLowerCase();
    const email = (user.email || '').toLowerCase();
    const query = mentionQuery.toLowerCase();
    return name.includes(query) || email.includes(query);
  }).slice(0, 5);

  const handleSubmit = () => {
    if (content.trim()) {
      onSubmit(content);
      setContent('');
      setShowMentions(false);
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              handleSubmit();
            }
          }}
          placeholder={placeholder}
          rows={3}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple resize-none"
        />
        {showMentions && filteredUsers.length > 0 && (
          <div className="absolute bottom-full left-0 mb-2 w-full bg-white border border-neutral-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
            {filteredUsers.map((user, index) => (
              <button
                key={user.id || user.email}
                type="button"
                onClick={() => insertMention(user)}
                className="w-full px-3 py-2 text-left hover:bg-neutral-50 flex items-center gap-2"
              >
                <div className="h-8 w-8 rounded-full bg-brand-purple/20 flex items-center justify-center text-brand-purple font-medium text-xs">
                  {(user.first_name?.[0] || user.email?.[0] || 'U').toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-medium text-neutral-900">
                    {user.first_name || user.email}
                  </div>
                  {user.email && user.first_name && (
                    <div className="text-xs text-neutral-500">{user.email}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <AtSymbolIcon className="h-4 w-4" />
          <span>Mention with @</span>
          <span className="text-neutral-400">•</span>
          <span>Press Cmd/Ctrl+Enter to submit</span>
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={!content.trim()}
            className="flex items-center gap-2 px-4 py-1.5 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-navy disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PaperAirplaneIcon className="h-4 w-4" />
            Post
          </button>
        </div>
      </div>
    </div>
  );
}
