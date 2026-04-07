import { useEffect, useState, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import PromptDialog from './ui/PromptDialog';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import axios from 'axios';

/**
 * TipTapEditor - Reusable rich text editor component
 * 
 * Features:
 * - Bold, italic, headings, lists
 * - Links and images
 * - Code blocks and blockquotes
 * - Placeholder text
 * - JSON output for storage
 */
function extractVideoToken(input) {
  const match = input.match(/\/videos\/watch\/([a-f0-9]+)/);
  if (match) return match[1];
  if (/^[a-f0-9]{32,}$/.test(input.trim())) return input.trim();
  return null;
}

export default function TipTapEditor({ content, onChange, placeholder = 'Start typing...' }) {
  const [promptState, setPromptState] = useState({ isOpen: false, title: '', defaultValue: '' });
  const uploadImageFileRef = useRef(null);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTab, setVideoTab] = useState('url'); // 'url' | 'search'
  const [videoSearchQuery, setVideoSearchQuery] = useState('');
  const [videoSearchResults, setVideoSearchResults] = useState([]);
  const [videoSearchLoading, setVideoSearchLoading] = useState(false);
  const [selectedVideoToken, setSelectedVideoToken] = useState(null);
  const videoSearchTimerRef = useRef(null);

  // Parse content if it's a string (JSON)
  let parsedContent = content;
  if (typeof content === 'string' && content.trim()) {
    try {
      parsedContent = JSON.parse(content);
    } catch (e) {
      // If it's not valid JSON, treat it as plain text
      parsedContent = content;
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3]
        },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: 'text-brand-purple underline hover:text-brand-navy'
        }
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'max-w-full h-auto rounded-lg'
        }
      }),
      Placeholder.configure({
        placeholder
      })
    ],
    content: parsedContent || '',
    onUpdate: ({ editor }) => {
      if (onChange) {
        // Return JSON as string so it can be stored
        onChange(JSON.stringify(editor.getJSON()));
      }
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none focus:outline-none min-h-[300px] px-4 py-3'
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (files?.length) {
          const imageFile = Array.from(files).find(f => f.type.startsWith('image/'));
          if (imageFile) {
            event.preventDefault();
            uploadImageFileRef.current?.(imageFile);
            return true;
          }
        }
        return false;
      },
      handlePaste: (view, event) => {
        const files = event.clipboardData?.files;
        if (files?.length) {
          const imageFile = Array.from(files).find(f => f.type.startsWith('image/'));
          if (imageFile) {
            event.preventDefault();
            uploadImageFileRef.current?.(imageFile);
            return true;
          }
        }
        return false;
      },
    }
  });

  // Update editor content when prop changes
  useEffect(() => {
    if (editor && content !== undefined) {
      const currentContent = JSON.stringify(editor.getJSON());
      if (currentContent !== content) {
        editor.commands.setContent(parsedContent || '');
      }
    }
  }, [content, editor, parsedContent]);

  const uploadImageFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/') || !editor) return;
    const formData = new FormData();
    formData.append('image', file);
    formData.append('folder', 'sops');
    try {
      const res = await fetch('/api/images', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        console.error('Image upload failed:', res.status, await res.text());
        return;
      }
      const data = await res.json();
      if (data.url) {
        editor.chain().focus().setImage({ src: data.url }).run();
      }
    } catch (err) {
      console.error('Image upload failed:', err);
    }
  }, [editor]);

  // Keep ref in sync for editorProps handlers
  useEffect(() => {
    uploadImageFileRef.current = uploadImageFile;
  }, [uploadImageFile]);

  if (!editor) {
    return null;
  }

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    setPromptState({
      isOpen: true,
      title: 'Enter URL',
      message: 'Enter the link URL:',
      defaultValue: previousUrl || '',
      placeholder: 'https://...',
      onSubmit: (url) => {
        if (url === '') {
          editor.chain().focus().extendMarkRange('link').unsetLink().run();
          return;
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
      },
    });
  };

  const addImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) uploadImageFile(file);
    };
    input.click();
  };

  const insertVideo = (token) => {
    const html = `<div class="video-embed" data-video-token="${token}" contenteditable="false">
      <div style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:12px;padding:16px;text-align:center;margin:8px 0;">
        <div style="font-size:24px;margin-bottom:4px;">&#127916;</div>
        <div style="font-size:13px;color:#6b7280;">Embedded Video</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:2px;">Token: ${token.substring(0, 12)}...</div>
      </div>
    </div>`;
    editor.chain().focus().insertContent(html).run();
    setShowVideoModal(false);
    setVideoUrl('');
    setSelectedVideoToken(null);
    setVideoSearchQuery('');
    setVideoSearchResults([]);
  };

  const handleVideoSearch = (query) => {
    setVideoSearchQuery(query);
    if (videoSearchTimerRef.current) clearTimeout(videoSearchTimerRef.current);
    if (!query.trim()) {
      setVideoSearchResults([]);
      return;
    }
    videoSearchTimerRef.current = setTimeout(async () => {
      setVideoSearchLoading(true);
      try {
        const res = await axios.get(`/api/videos/library?search=${encodeURIComponent(query)}&limit=5`, {
          withCredentials: true,
        });
        setVideoSearchResults(res.data || []);
      } catch (err) {
        console.error('Video search failed:', err);
        setVideoSearchResults([]);
      } finally {
        setVideoSearchLoading(false);
      }
    }, 300);
  };

  const detectedToken = videoTab === 'url' ? extractVideoToken(videoUrl) : selectedVideoToken;

  return (
    <div className="border border-neutral-300 rounded-lg overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 border-b border-neutral-200 bg-neutral-50">
        {/* Headings */}
        <div className="flex items-center gap-1 border-r border-neutral-300 pr-2">
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`p-2 rounded hover:bg-neutral-200 transition-colors ${
              editor.isActive('heading', { level: 1 }) ? 'bg-brand-purple text-white' : 'text-neutral-700'
            }`}
            title="Heading 1"
            type="button"
          >
            <span className="text-sm font-bold">H1</span>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`p-2 rounded hover:bg-neutral-200 transition-colors ${
              editor.isActive('heading', { level: 2 }) ? 'bg-brand-purple text-white' : 'text-neutral-700'
            }`}
            title="Heading 2"
            type="button"
          >
            <span className="text-sm font-bold">H2</span>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`p-2 rounded hover:bg-neutral-200 transition-colors ${
              editor.isActive('heading', { level: 3 }) ? 'bg-brand-purple text-white' : 'text-neutral-700'
            }`}
            title="Heading 3"
            type="button"
          >
            <span className="text-sm font-bold">H3</span>
          </button>
        </div>

        {/* Text formatting */}
        <div className="flex items-center gap-1 border-r border-neutral-300 pr-2">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-2 rounded hover:bg-neutral-200 transition-colors ${
              editor.isActive('bold') ? 'bg-brand-purple text-white' : 'text-neutral-700'
            }`}
            title="Bold"
            type="button"
          >
            <BoldIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-2 rounded hover:bg-neutral-200 transition-colors ${
              editor.isActive('italic') ? 'bg-brand-purple text-white' : 'text-neutral-700'
            }`}
            title="Italic"
            type="button"
          >
            <ItalicIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={`p-2 rounded hover:bg-neutral-200 transition-colors ${
              editor.isActive('code') ? 'bg-brand-purple text-white' : 'text-neutral-700'
            }`}
            title="Inline Code"
            type="button"
          >
            <CodeIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Lists */}
        <div className="flex items-center gap-1 border-r border-neutral-300 pr-2">
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-2 rounded hover:bg-neutral-200 transition-colors ${
              editor.isActive('bulletList') ? 'bg-brand-purple text-white' : 'text-neutral-700'
            }`}
            title="Bullet List"
            type="button"
          >
            <ListBulletedIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-2 rounded hover:bg-neutral-200 transition-colors ${
              editor.isActive('orderedList') ? 'bg-brand-purple text-white' : 'text-neutral-700'
            }`}
            title="Numbered List"
            type="button"
          >
            <ListNumberedIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Blocks */}
        <div className="flex items-center gap-1 border-r border-neutral-300 pr-2">
          <button
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={`p-2 rounded hover:bg-neutral-200 transition-colors ${
              editor.isActive('codeBlock') ? 'bg-brand-purple text-white' : 'text-neutral-700'
            }`}
            title="Code Block"
            type="button"
          >
            <CodeIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`p-2 rounded hover:bg-neutral-200 transition-colors ${
              editor.isActive('blockquote') ? 'bg-brand-purple text-white' : 'text-neutral-700'
            }`}
            title="Blockquote"
            type="button"
          >
            <QuoteIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Link and Image */}
        <div className="flex items-center gap-1">
          <button
            onClick={setLink}
            className={`p-2 rounded hover:bg-neutral-200 transition-colors ${
              editor.isActive('link') ? 'bg-brand-purple text-white' : 'text-neutral-700'
            }`}
            title="Add Link"
            type="button"
          >
            <LinkIcon className="h-4 w-4" />
          </button>
          <button
            onClick={addImage}
            className="p-2 rounded hover:bg-neutral-200 transition-colors text-neutral-700"
            title="Add Image"
            type="button"
          >
            <ImageIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowVideoModal(true)}
            className="p-2 rounded hover:bg-neutral-200 transition-colors text-neutral-700"
            title="Insert Video"
            type="button"
          >
            <VideoCameraIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Editor Content */}
      <div className="bg-white">
        <EditorContent editor={editor} />
      </div>
      <PromptDialog
        isOpen={promptState.isOpen}
        onClose={() => setPromptState(s => ({ ...s, isOpen: false }))}
        onSubmit={(val) => promptState.onSubmit?.(val)}
        title={promptState.title}
        message={promptState.message}
        placeholder={promptState.placeholder}
        defaultValue={promptState.defaultValue || ''}
      />

      {/* Video Insert Modal */}
      {showVideoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
              <h3 className="text-base font-semibold text-neutral-900">Insert Video</h3>
              <button
                onClick={() => { setShowVideoModal(false); setVideoUrl(''); setSelectedVideoToken(null); setVideoSearchQuery(''); setVideoSearchResults([]); }}
                className="text-neutral-400 hover:text-neutral-600 transition-colors"
                type="button"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-neutral-200">
              <button
                onClick={() => { setVideoTab('url'); setSelectedVideoToken(null); }}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${videoTab === 'url' ? 'text-brand-purple border-b-2 border-brand-purple' : 'text-neutral-500 hover:text-neutral-700'}`}
                type="button"
              >
                Paste URL
              </button>
              <button
                onClick={() => { setVideoTab('search'); setVideoUrl(''); }}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${videoTab === 'search' ? 'text-brand-purple border-b-2 border-brand-purple' : 'text-neutral-500 hover:text-neutral-700'}`}
                type="button"
              >
                Search Library
              </button>
            </div>

            {/* Content */}
            <div className="px-5 py-4">
              {videoTab === 'url' ? (
                <div>
                  <input
                    type="text"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="Paste a video watch URL..."
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple"
                    autoFocus
                  />
                  {videoUrl && (
                    <div className="mt-2 text-xs text-neutral-500">
                      {detectedToken ? (
                        <span className="text-green-600">Detected token: {detectedToken.substring(0, 16)}...</span>
                      ) : (
                        <span className="text-red-500">Could not detect a valid video token from this URL</span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <input
                    type="text"
                    value={videoSearchQuery}
                    onChange={(e) => handleVideoSearch(e.target.value)}
                    placeholder="Search videos by title..."
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple"
                    autoFocus
                  />
                  <div className="mt-3 max-h-48 overflow-y-auto space-y-2">
                    {videoSearchLoading && (
                      <div className="text-center text-sm text-neutral-400 py-4">Searching...</div>
                    )}
                    {!videoSearchLoading && videoSearchQuery && videoSearchResults.length === 0 && (
                      <div className="text-center text-sm text-neutral-400 py-4">No videos found</div>
                    )}
                    {videoSearchResults.map((video) => (
                      <button
                        key={video.token || video.id}
                        onClick={() => setSelectedVideoToken(video.token)}
                        className={`w-full text-left flex items-center gap-3 p-2.5 rounded-lg border transition-all ${
                          selectedVideoToken === video.token
                            ? 'border-brand-purple bg-brand-purple/5'
                            : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                        }`}
                        type="button"
                      >
                        <div className="flex-shrink-0 w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center">
                          <VideoCameraIcon className="h-5 w-5 text-neutral-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-neutral-800 truncate">{video.title || 'Untitled Video'}</div>
                          {video.created_at && (
                            <div className="text-xs text-neutral-400">{new Date(video.created_at).toLocaleDateString()}</div>
                          )}
                        </div>
                        {selectedVideoToken === video.token && (
                          <svg className="h-4 w-4 text-brand-purple flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-neutral-200 bg-neutral-50">
              <button
                onClick={() => { setShowVideoModal(false); setVideoUrl(''); setSelectedVideoToken(null); setVideoSearchQuery(''); setVideoSearchResults([]); }}
                className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-800 transition-colors"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={() => detectedToken && insertVideo(detectedToken)}
                disabled={!detectedToken}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-purple rounded-lg hover:bg-brand-navy transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                type="button"
              >
                Insert Video
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Icon components (simple implementations)
function BoldIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6zm0 8h9a4 4 0 014 4 4 4 0 01-4 4H6z" />
    </svg>
  );
}

function ItalicIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 4h4l-4 16h-4m12 0h-4" />
    </svg>
  );
}

function ListBulletedIcon({ className }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <circle cx="4" cy="6" r="2" />
      <circle cx="4" cy="12" r="2" />
      <circle cx="4" cy="18" r="2" />
      <path fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={2} d="M9 6h11M9 12h11M9 18h11" />
    </svg>
  );
}

function ListNumberedIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <text x="2" y="8" fontSize="7" fontWeight="bold">1</text>
      <text x="2" y="14" fontSize="7" fontWeight="bold">2</text>
      <text x="2" y="20" fontSize="7" fontWeight="bold">3</text>
      <path fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={2} d="M9 6h11M9 12h11M9 18h11" />
    </svg>
  );
}

function LinkIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}

function ImageIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function CodeIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  );
}

function QuoteIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
    </svg>
  );
}

function VideoCameraIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  );
}

