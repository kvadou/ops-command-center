/**
 * TiptapEditor - Rich Text Editor for News Feed
 * 
 * Features:
 * - Rich text formatting (bold, italic, lists, etc.)
 * - @mentions with autocomplete
 * - Slash commands (/image, /poll, /event, etc.)
 * - Emoji picker integration
 * - Drag-and-drop image upload
 * - Link detection and previews
 */

import React, { useCallback, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Mention from '@tiptap/extension-mention';
import { Extension } from '@tiptap/core';
import {
  BoldIcon,
  ItalicIcon,
  ListBulletIcon,
  LinkIcon,
  PhotoIcon,
  FaceSmileIcon,
} from '@heroicons/react/24/outline';

// Slash Commands Extension
const SlashCommands = Extension.create({
  name: 'slashCommands',
  
  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({ editor, range, props }) => {
          props.command({ editor, range });
        },
      },
    };
  },
});

// Mention suggestion items (users to mention)
const getMentionSuggestions = async (query) => {
  try {
    const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}&limit=5`, {
      credentials: 'include',
    });
    if (response.ok) {
      const data = await response.json();
      return data.users || [];
    }
  } catch (error) {
    console.error('Error fetching mention suggestions:', error);
  }
  return [];
};

// Mention Suggestion Component
const MentionList = forwardRef(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index) => {
    const item = items[index];
    if (item) {
      command({ id: item.id, label: item.name || item.email });
    }
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((selectedIndex + items.length - 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((selectedIndex + 1) % items.length);
        return true;
      }
      if (event.key === 'Enter') {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  useEffect(() => setSelectedIndex(0), [items]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-lg border border-neutral-200 overflow-hidden max-h-64 overflow-y-auto">
      {items.map((item, index) => (
        <button
          key={item.id}
          onClick={() => selectItem(index)}
          className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${
            index === selectedIndex ? 'bg-brand-purple/10 text-brand-purple' : 'hover:bg-neutral-50'
          }`}
        >
          <div className="w-8 h-8 rounded-full bg-brand-purple/20 flex items-center justify-center text-brand-purple font-medium text-xs">
            {(item.name || item.email || '?')[0].toUpperCase()}
          </div>
          <div>
            <div className="font-medium">{item.name || item.email?.split('@')[0]}</div>
            {item.email && <div className="text-xs text-neutral-500">{item.email}</div>}
          </div>
        </button>
      ))}
    </div>
  );
});

MentionList.displayName = 'MentionList';

// Toolbar Button Component
const ToolbarButton = ({ onClick, active, disabled, children, title }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`p-1.5 rounded transition-colors ${
      active 
        ? 'bg-brand-purple text-white' 
        : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    {children}
  </button>
);

// Main Editor Component
const TiptapEditor = forwardRef(({ 
  content = '', 
  onChange, 
  onMentionsChange,
  placeholder = "What's on your mind?",
  editable = true,
  minHeight = '120px',
  maxHeight = '400px',
  showToolbar = true,
  autoFocus = false,
  onImageUpload,
  className = ''
}, ref) => {
  const [mentionSuggestions, setMentionSuggestions] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [mentions, setMentions] = useState([]);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const emojiButtonRef = React.useRef(null);

  // Configure editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
        // Disable built-in link to avoid duplicate
        link: false,
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-brand-purple underline hover:text-brand-navy',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'max-w-full rounded-lg my-2',
        },
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'bg-brand-purple/10 text-brand-purple px-1 rounded font-medium',
        },
        suggestion: {
          items: async ({ query }) => {
            if (query.length < 1) return [];
            const users = await getMentionSuggestions(query);
            setMentionSuggestions(users);
            return users;
          },
          render: () => {
            let component;
            let popup;

            return {
              onStart: (props) => {
                component = document.createElement('div');
                component.className = 'mention-suggestions absolute z-50';
                document.body.appendChild(component);
                
                // Position below cursor
                const rect = props.clientRect?.();
                if (rect) {
                  component.style.left = `${rect.left}px`;
                  component.style.top = `${rect.bottom + 8}px`;
                }
              },
              onUpdate: (props) => {
                // Update position
                const rect = props.clientRect?.();
                if (rect && component) {
                  component.style.left = `${rect.left}px`;
                  component.style.top = `${rect.bottom + 8}px`;
                }
              },
              onKeyDown: (props) => {
                if (props.event.key === 'Escape') {
                  if (component) {
                    component.remove();
                  }
                  return true;
                }
                return false;
              },
              onExit: () => {
                if (component) {
                  component.remove();
                }
              },
            };
          },
        },
      }),
    ],
    content,
    editable,
    autofocus: autoFocus,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const json = editor.getJSON();
      
      // Extract mentions from content
      const extractedMentions = [];
      const traverse = (node) => {
        if (node.type === 'mention' && node.attrs) {
          extractedMentions.push({
            id: node.attrs.id,
            label: node.attrs.label,
          });
        }
        if (node.content) {
          node.content.forEach(traverse);
        }
      };
      traverse(json);
      
      setMentions(extractedMentions);
      
      if (onChange) {
        onChange({
          html,
          json,
          text: editor.getText(),
          mentions: extractedMentions,
        });
      }
      
      if (onMentionsChange) {
        onMentionsChange(extractedMentions);
      }
    },
  });

  // Expose editor methods via ref
  useImperativeHandle(ref, () => ({
    getEditor: () => editor,
    getContent: () => ({
      html: editor?.getHTML() || '',
      json: editor?.getJSON() || null,
      text: editor?.getText() || '',
      mentions,
    }),
    setContent: (content) => {
      if (editor) {
        editor.commands.setContent(content);
      }
    },
    clearContent: () => {
      if (editor) {
        editor.commands.clearContent();
      }
    },
    focus: () => {
      if (editor) {
        editor.commands.focus();
      }
    },
    insertImage: (url) => {
      if (editor) {
        editor.chain().focus().setImage({ src: url }).run();
      }
    },
    insertText: (text) => {
      if (editor) {
        editor.chain().focus().insertContent(text).run();
      }
    },
  }));

  // Handle link insertion
  const setLink = useCallback(() => {
    if (!editor) return;
    
    const previousUrl = editor.getAttributes('link').href || '';
    setLinkUrl(previousUrl);
    setShowLinkInput(true);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    
    if (linkUrl === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
    }
    setShowLinkInput(false);
    setLinkUrl('');
  }, [editor, linkUrl]);

  // Handle image upload
  const handleImageUpload = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return;

    try {
      if (onImageUpload) {
        const url = await onImageUpload(file);
        if (url && editor) {
          editor.chain().focus().setImage({ src: url }).run();
        }
      }
    } catch (error) {
      console.error('Error uploading image:', error);
    }
  }, [editor, onImageUpload]);

  // Handle paste events for images
  useEffect(() => {
    if (!editor) return;

    const handlePaste = (event) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          event.preventDefault();
          const file = item.getAsFile();
          if (file) {
            handleImageUpload(file);
          }
          break;
        }
      }
    };

    const editorElement = editor.view.dom;
    editorElement.addEventListener('paste', handlePaste);

    return () => {
      editorElement.removeEventListener('paste', handlePaste);
    };
  }, [editor, handleImageUpload]);

  // Handle drop events for images
  useEffect(() => {
    if (!editor) return;

    const handleDrop = (event) => {
      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return;

      for (const file of files) {
        if (file.type.startsWith('image/')) {
          event.preventDefault();
          handleImageUpload(file);
          break;
        }
      }
    };

    const editorElement = editor.view.dom;
    editorElement.addEventListener('drop', handleDrop);

    return () => {
      editorElement.removeEventListener('drop', handleDrop);
    };
  }, [editor, handleImageUpload]);

  // Emoji categories for picker
  const emojiCategories = {
    'Smileys': ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '😋', '😎', '🤩', '🥳', '😏', '🤔', '🤗', '🤭', '😐', '😑', '😶', '🙄', '😮', '😲', '😴'],
    'Gestures': ['👍', '👎', '👏', '🙌', '🤝', '👊', '✊', '🤛', '🤜', '🤞', '✌️', '🤟', '🤘', '👌', '🤌', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤙', '💪', '🙏'],
    'Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '💕', '💞', '💓', '💗', '💖', '💘', '💝'],
    'Celebration': ['🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉', '🏅', '🎯', '⭐', '🌟', '✨', '💫', '🔥', '💥', '🎵', '🎶'],
    'Objects': ['💼', '📚', '📝', '✏️', '📌', '📍', '🔑', '🔒', '💡', '📅', '📆', '⏰', '📧', '💬', '💭', '🔔', '📢', '📣'],
    'Symbols': ['✅', '❌', '⚠️', '🚫', '💯', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚪', '⚫', '▶️', '⏸️', '⏹️', '➡️', '⬅️', '⬆️', '⬇️'],
  };
  const [activeEmojiCategory, setActiveEmojiCategory] = useState('Smileys');

  if (!editor) {
    return null;
  }

  return (
    <div className={`tiptap-editor-container ${className}`}>
      {/* Editor Toolbar */}
      {showToolbar && (
        <div className="flex items-center gap-1 p-2 border-b border-neutral-200 bg-neutral-50 rounded-t-lg">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            title="Bold (Ctrl+B)"
          >
            <BoldIcon className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            title="Italic (Ctrl+I)"
          >
            <ItalicIcon className="h-4 w-4" />
          </ToolbarButton>
          <div className="w-px h-5 bg-neutral-300 mx-1" />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            title="Bullet List"
          >
            <ListBulletIcon className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={setLink}
            active={editor.isActive('link')}
            title="Add Link"
          >
            <LinkIcon className="h-4 w-4" />
          </ToolbarButton>
          <div className="w-px h-5 bg-neutral-300 mx-1" />
          
          {/* Image Upload Button */}
          {onImageUpload && (
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                  e.target.value = '';
                }}
              />
              <ToolbarButton as="span" title="Add Image">
                <PhotoIcon className="h-4 w-4" />
              </ToolbarButton>
            </label>
          )}

          {/* Link Input */}
          {showLinkInput && (
            <div className="flex items-center gap-1 ml-2 bg-white border border-neutral-200 rounded-lg px-2 py-1">
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                className="text-sm border-none outline-none w-40"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyLink();
                  }
                  if (e.key === 'Escape') {
                    setShowLinkInput(false);
                    setLinkUrl('');
                  }
                }}
              />
              <button
                type="button"
                onClick={applyLink}
                className="text-xs bg-brand-purple text-white px-2 py-0.5 rounded hover:bg-brand-navy"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => { setShowLinkInput(false); setLinkUrl(''); }}
                className="text-xs text-neutral-500 hover:text-neutral-700"
              >
                ✕
              </button>
            </div>
          )}

          {/* Emoji Picker Toggle */}
          <div className="relative" ref={emojiButtonRef}>
            <ToolbarButton
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              active={showEmojiPicker}
              title="Add Emoji"
            >
              <FaceSmileIcon className="h-4 w-4" />
            </ToolbarButton>
            
            {showEmojiPicker && (
              <div 
                className="fixed bg-white rounded-xl shadow-2xl border border-neutral-200 z-popover w-[420px]"
                style={{
                  top: emojiButtonRef.current ? emojiButtonRef.current.getBoundingClientRect().bottom + 8 : 0,
                  left: emojiButtonRef.current ? Math.min(emojiButtonRef.current.getBoundingClientRect().left, window.innerWidth - 440) : 0,
                }}
              >
                {/* Category Tabs */}
                <div className="flex border-b border-neutral-200 px-3 pt-3 pb-2 gap-2 overflow-x-auto">
                  {Object.keys(emojiCategories).map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setActiveEmojiCategory(category)}
                      className={`px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition-colors ${
                        activeEmojiCategory === category
                          ? 'bg-brand-purple text-white font-medium'
                          : 'text-neutral-600 hover:bg-neutral-100'
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
                {/* Emoji Grid */}
                <div className="p-3 max-h-72 overflow-y-auto">
                  <div className="grid grid-cols-10 gap-1">
                    {emojiCategories[activeEmojiCategory].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          editor.chain().focus().insertContent(emoji).run();
                          setShowEmojiPicker(false);
                        }}
                        className="p-2 hover:bg-neutral-100 rounded-lg text-2xl flex items-center justify-center transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Mention hint */}
          <span className="ml-auto text-xs text-neutral-500">
            Type @ to mention someone
          </span>
        </div>
      )}

      {/* Editor Content */}
      <div 
        className="relative"
        style={{ minHeight, maxHeight }}
      >
        <EditorContent 
          editor={editor} 
          className="prose prose-sm max-w-none p-3 focus:outline-none overflow-y-auto"
          style={{ minHeight, maxHeight }}
        />
      </div>

      {/* Editor Styles */}
      <style>{`
        .tiptap-editor-container .ProseMirror {
          min-height: ${minHeight};
          max-height: ${maxHeight};
          overflow-y: auto;
          outline: none;
        }
        
        .tiptap-editor-container .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }
        
        .tiptap-editor-container .ProseMirror p {
          margin: 0.5em 0;
        }
        
        .tiptap-editor-container .ProseMirror ul {
          list-style-type: disc;
          padding-left: 1.5em;
        }
        
        .tiptap-editor-container .ProseMirror ol {
          list-style-type: decimal;
          padding-left: 1.5em;
        }
        
        .tiptap-editor-container .ProseMirror h2 {
          font-size: 1.25em;
          font-weight: 600;
          margin: 1em 0 0.5em;
        }
        
        .tiptap-editor-container .ProseMirror h3 {
          font-size: 1.1em;
          font-weight: 600;
          margin: 1em 0 0.5em;
        }
        
        .tiptap-editor-container .ProseMirror img {
          max-width: 100%;
          border-radius: 0.5rem;
          margin: 0.5em 0;
        }
        
        .tiptap-editor-container .ProseMirror blockquote {
          border-left: 3px solid #6A469D;
          padding-left: 1em;
          margin-left: 0;
          color: #6b7280;
        }
      `}</style>
    </div>
  );
});

TiptapEditor.displayName = 'TiptapEditor';

export default TiptapEditor;

