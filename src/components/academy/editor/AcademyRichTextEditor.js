import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import DOMPurify from 'dompurify';
import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-text-style';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { marked } from 'marked';
import { useToast } from '../../../hooks/useToast';
import { Node, mergeAttributes } from '@tiptap/core';
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikethroughIcon,
  ListBulletIcon,
  NumberedListIcon,
  ChatBubbleBottomCenterTextIcon,
  LinkIcon,
  PhotoIcon,
  VideoCameraIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  Bars3BottomLeftIcon,
  Bars3Icon,
  Bars3BottomRightIcon,
  PaintBrushIcon,
  ChevronDownIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

// Gmail-style color palette
const COLOR_PALETTE = {
  // Grayscale row
  grays: ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'],
  // Bright/primary colors row
  brights: ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'],
  // Gradient grid (7 rows x 10 columns) - light to dark for each hue
  gradient: [
    ['#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'],
    ['#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'],
    ['#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0'],
    ['#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'],
    ['#85200c', '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#0b5394', '#351c75', '#741b47'],
    ['#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763', '#20124d', '#4c1130'],
  ],
};

// Size options for images and videos
const SIZE_OPTIONS = [
  { value: 'small', label: 'Small', width: '25%' },
  { value: 'medium', label: 'Medium', width: '50%' },
  { value: 'large', label: 'Large', width: '75%' },
  { value: 'full', label: 'Full Width', width: '100%' },
];

// Alignment options
const ALIGN_OPTIONS = [
  { value: 'left', label: 'Left', icon: Bars3BottomLeftIcon },
  { value: 'center', label: 'Center', icon: Bars3Icon },
  { value: 'right', label: 'Right', icon: Bars3BottomRightIcon },
];

// Helper to get video embed URL
function getVideoEmbedUrl(url) {
  if (!url) return null;

  // YouTube
  const youtubeMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^&?/]+)/);
  if (youtubeMatch) {
    return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
  }

  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }

  // Loom
  const loomMatch = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
  if (loomMatch) {
    return `https://www.loom.com/embed/${loomMatch[1]}`;
  }

  return null;
}

// Custom Image Component with controls
function ResizableImageComponent({ node, updateAttributes, deleteNode, selected }) {
  const { src, alt, size = 'full', align = 'center' } = node.attrs;
  const [showControls, setShowControls] = useState(false);

  const sizeStyle = SIZE_OPTIONS.find(s => s.value === size)?.width || '100%';

  const alignmentClass = {
    left: 'mr-auto',
    center: 'mx-auto',
    right: 'ml-auto',
  }[align] || 'mx-auto';

  const floatClass = size !== 'full' ? {
    left: 'float-left mr-4 mb-2',
    right: 'float-right ml-4 mb-2',
    center: '',
  }[align] : '';

  return (
    <NodeViewWrapper className={`relative ${size !== 'full' && align !== 'center' ? 'inline-block' : 'block'}`}>
      <div
        className={`relative group ${floatClass} ${align === 'center' && size !== 'full' ? alignmentClass : ''}`}
        style={{ width: sizeStyle, maxWidth: '100%' }}
        onClick={() => setShowControls(!showControls)}
      >
        <img
          src={src}
          alt={alt || ''}
          className={`rounded-lg w-full ${selected ? 'ring-2 ring-brand-navy' : ''}`}
          draggable={false}
        />

        {/* Controls overlay - always show when selected or hovering */}
        {(selected || showControls) && (
          <div className="absolute top-2 left-2 right-2 flex justify-between items-start z-10">
            {/* Size and alignment controls */}
            <div className="flex flex-wrap gap-1 bg-white/95 rounded-lg shadow-lg p-1.5 border border-neutral-200">
              {/* Size buttons */}
              <div className="flex gap-0.5 border-r border-neutral-200 pr-1.5 mr-1">
                {SIZE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateAttributes({ size: option.value });
                    }}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      size === option.value
                        ? 'bg-brand-navy text-white'
                        : 'hover:bg-neutral-100 text-neutral-600'
                    }`}
                    title={option.label}
                  >
                    {option.label.charAt(0)}
                  </button>
                ))}
              </div>

              {/* Alignment buttons */}
              <div className="flex gap-0.5">
                {ALIGN_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateAttributes({ align: option.value });
                      }}
                      className={`p-1 rounded transition-colors ${
                        align === option.value
                          ? 'bg-brand-navy text-white'
                          : 'hover:bg-neutral-100 text-neutral-600'
                      }`}
                      title={option.label}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Delete button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteNode();
              }}
              className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-lg transition-colors"
              title="Delete image"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Size indicator badge */}
        <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/50 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity">
          {SIZE_OPTIONS.find(s => s.value === size)?.label} · {align}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

// Custom Video Component with controls
function ResizableVideoComponent({ node, updateAttributes, deleteNode, selected }) {
  const { src, size = 'large', align = 'center' } = node.attrs;
  const [showControls, setShowControls] = useState(false);

  const embedUrl = getVideoEmbedUrl(src);
  const sizeStyle = SIZE_OPTIONS.find(s => s.value === size)?.width || '75%';

  const alignmentClass = {
    left: 'mr-auto',
    center: 'mx-auto',
    right: 'ml-auto',
  }[align] || 'mx-auto';

  return (
    <NodeViewWrapper className="relative block my-4">
      <div
        className={`relative group ${alignmentClass}`}
        style={{ width: sizeStyle, maxWidth: '100%' }}
        onClick={() => setShowControls(!showControls)}
      >
        <div className={`aspect-video rounded-lg overflow-hidden bg-neutral-100 ${selected ? 'ring-2 ring-brand-navy' : ''}`}>
          {embedUrl ? (
            <iframe
              src={embedUrl}
              className="w-full h-full"
              allowFullScreen
              allow="autoplay; fullscreen; picture-in-picture"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-400">
              <VideoCameraIcon className="h-12 w-12" />
            </div>
          )}
        </div>

        {/* Controls overlay */}
        {(selected || showControls) && (
          <div className="absolute top-2 left-2 right-2 flex justify-between items-start z-10">
            <div className="flex flex-wrap gap-1 bg-white/95 rounded-lg shadow-lg p-1.5 border border-neutral-200">
              {/* Size buttons */}
              <div className="flex gap-0.5 border-r border-neutral-200 pr-1.5 mr-1">
                {SIZE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateAttributes({ size: option.value });
                    }}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      size === option.value
                        ? 'bg-brand-navy text-white'
                        : 'hover:bg-neutral-100 text-neutral-600'
                    }`}
                    title={option.label}
                  >
                    {option.label.charAt(0)}
                  </button>
                ))}
              </div>

              {/* Alignment buttons */}
              <div className="flex gap-0.5">
                {ALIGN_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateAttributes({ align: option.value });
                      }}
                      className={`p-1 rounded transition-colors ${
                        align === option.value
                          ? 'bg-brand-navy text-white'
                          : 'hover:bg-neutral-100 text-neutral-600'
                      }`}
                      title={option.label}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteNode();
              }}
              className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-lg transition-colors"
              title="Delete video"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

// Custom Image Extension with size and alignment
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      size: {
        default: 'full',
        renderHTML: attributes => ({
          'data-size': attributes.size,
        }),
        parseHTML: element => element.getAttribute('data-size') || 'full',
      },
      align: {
        default: 'center',
        renderHTML: attributes => ({
          'data-align': attributes.align,
        }),
        parseHTML: element => element.getAttribute('data-align') || 'center',
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },
});

// Custom Video Extension
const VideoEmbed = Node.create({
  name: 'video',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      size: { default: 'large' },
      align: { default: 'center' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-video]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { src, size, align } = node.attrs;
    const embedUrl = getVideoEmbedUrl(src);

    // Create proper HTML structure with iframe for saved content
    return ['div', mergeAttributes({
      'data-video': '',
      'data-size': size,
      'data-align': align,
      'data-src': src,
      class: `video-embed video-size-${size} video-align-${align}`,
    }, HTMLAttributes),
      embedUrl ? ['iframe', {
        src: embedUrl,
        allowfullscreen: 'true',
        allow: 'autoplay; fullscreen; picture-in-picture',
        class: 'video-iframe',
      }] : ['div', { class: 'video-placeholder' }, 'Video not available']
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableVideoComponent);
  },

  addCommands() {
    return {
      setVideo: options => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: options,
        });
      },
    };
  },
});

/**
 * Detect if content is markdown (vs HTML)
 * Checks for common markdown patterns
 */
function isMarkdown(content) {
  if (!content || typeof content !== 'string') return false;

  // If it starts with HTML tags, it's probably HTML
  if (content.trim().startsWith('<')) return false;

  // Check for common markdown patterns
  const markdownPatterns = [
    /^#{1,6}\s/m,           // Headings: # ## ### etc
    /\*\*[^*]+\*\*/,        // Bold: **text**
    /\*[^*]+\*/,            // Italic: *text*
    /^\s*[-*+]\s/m,         // Unordered lists
    /^\s*\d+\.\s/m,         // Ordered lists
    /\[.+\]\(.+\)/,         // Links: [text](url)
    /^\s*>\s/m,             // Blockquotes
    /\|.+\|/,               // Tables
    /^---+$/m,              // Horizontal rules
    /`[^`]+`/,              // Inline code
  ];

  return markdownPatterns.some(pattern => pattern.test(content));
}

/**
 * Convert markdown to HTML with better table support
 */
function markdownToHtml(content) {
  if (!content) return '';

  // Configure marked for GFM (GitHub Flavored Markdown)
  marked.setOptions({
    gfm: true,
    breaks: true,
    tables: true,
  });

  try {
    return marked.parse(content);
  } catch (e) {
    console.error('Markdown parsing error:', e);
    return content;
  }
}

/**
 * Convert JSON sections format to HTML
 */
function sectionsToHtml(sections) {
  if (!sections || !Array.isArray(sections)) return '';

  return sections.map(section => {
    let html = '';
    if (section.title) {
      html += `<h2>${section.title}</h2>`;
    }
    if (section.content) {
      // The content within sections is typically markdown
      html += markdownToHtml(section.content);
    }
    return html;
  }).join('<hr />');
}

/**
 * Prepare content for display - converts markdown/JSON to HTML if needed
 */
export function prepareContent(content) {
  if (!content) return '';

  // If content is a string, check if it's JSON
  if (typeof content === 'string') {
    // Check if it looks like JSON
    const trimmed = content.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(content);
        // Handle JSON with sections format
        if (parsed.sections && Array.isArray(parsed.sections)) {
          return sectionsToHtml(parsed.sections);
        }
        // Handle TipTap JSON - return as-is for the editor
        if (parsed.type === 'doc' && parsed.content) {
          return content; // Keep as JSON string for TipTap
        }
        // Handle plain object with description
        if (parsed.description) {
          return `<p>${parsed.description}</p>`;
        }
        // Recursively prepare if it's a simple value
        if (typeof parsed === 'string') {
          return prepareContent(parsed);
        }
      } catch {
        // Not valid JSON, continue with other checks
      }
    }

    // Check if it's markdown
    if (isMarkdown(content)) {
      return markdownToHtml(content);
    }
  }

  // If content is already an object
  if (typeof content === 'object' && content !== null) {
    // Handle sections format
    if (content.sections && Array.isArray(content.sections)) {
      return sectionsToHtml(content.sections);
    }
    // Handle TipTap format
    if (content.type === 'doc' && content.content) {
      return JSON.stringify(content); // Convert to string for TipTap
    }
    // Handle description
    if (content.description) {
      return `<p>${content.description}</p>`;
    }
  }

  return content;
}

/**
 * AcademyRichTextEditor - Full-featured WYSIWYG editor for Academy content
 *
 * Features:
 * - Text formatting (bold, italic, underline, strikethrough)
 * - Headings (H1, H2, H3)
 * - Lists (bullet, numbered)
 * - Blockquote
 * - Text alignment
 * - Links and images
 * - Text highlighting
 * - Undo/Redo
 */

// Heading icon components
const H1Icon = () => (
  <span className="font-bold text-sm">H1</span>
);
const H2Icon = () => (
  <span className="font-bold text-sm">H2</span>
);
const H3Icon = () => (
  <span className="font-bold text-sm">H3</span>
);
const ParagraphIcon = () => (
  <span className="font-medium text-sm">P</span>
);

// Editor Toolbar Button
function ToolbarButton({ onClick, isActive, disabled, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        p-2 rounded-lg transition-colors
        ${isActive
          ? 'bg-brand-navy/10 text-brand-navy'
          : 'text-neutral-600 hover:bg-neutral-100'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      {children}
    </button>
  );
}

// Toolbar Divider
function ToolbarDivider() {
  return <div className="w-px h-6 bg-neutral-200 mx-1 self-center" />;
}

// Input Modal Component - replaces window.prompt()
function InputModal({ isOpen, onClose, onSubmit, title, placeholder, defaultValue = '', submitLabel = 'OK' }) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      // Focus input after modal opens
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, defaultValue]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(value);
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">{title}</h3>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-navy/20 focus:border-brand-navy outline-none"
          />
          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-brand-navy hover:bg-primary-600 rounded-lg transition-colors"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Image Upload Modal - supports both file upload and URL
function ImageUploadModal({ isOpen, onClose, onSubmit, onUpload }) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' or 'url'
  const [urlValue, setUrlValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const urlInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setUrlValue('');
      setUploading(false);
      setActiveTab(onUpload ? 'upload' : 'url');
      if (!onUpload) {
        setTimeout(() => urlInputRef.current?.focus(), 50);
      }
    }
  }, [isOpen, onUpload]);

  const handleFileSelect = async (file) => {
    if (!file || !onUpload) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setUploading(true);
    try {
      const url = await onUpload(file);
      if (url) {
        onSubmit(url);
        onClose();
      }
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error('Failed to upload image. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleUrlSubmit = (e) => {
    e.preventDefault();
    if (urlValue.trim()) {
      onSubmit(urlValue.trim());
      onClose();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">Add Image</h3>

          {/* Tab buttons - only show if upload is available */}
          {onUpload && (
            <div className="flex border-b border-neutral-200 mb-4">
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'upload'
                    ? 'border-brand-navy text-brand-navy'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}
              >
                Upload File
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('url')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'url'
                    ? 'border-brand-navy text-brand-navy'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}
              >
                Paste URL
              </button>
            </div>
          )}

          {/* Upload tab content */}
          {activeTab === 'upload' && onUpload && (
            <div>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => !uploading && fileInputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                  ${dragOver ? 'border-brand-navy bg-brand-navy/5' : 'border-neutral-300 hover:border-brand-navy hover:bg-neutral-50'}
                  ${uploading ? 'opacity-50 cursor-wait' : ''}
                `}
              >
                <PhotoIcon className="h-12 w-12 mx-auto text-neutral-400" />
                <p className="mt-2 text-sm text-neutral-600">
                  {uploading ? 'Uploading...' : 'Click to upload or drag and drop'}
                </p>
                <p className="text-xs text-neutral-400 mt-1">PNG, JPG, GIF up to 10MB</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
                className="hidden"
              />
            </div>
          )}

          {/* URL tab content */}
          {(activeTab === 'url' || !onUpload) && (
            <form onSubmit={handleUrlSubmit}>
              <input
                ref={urlInputRef}
                type="text"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-navy/20 focus:border-brand-navy outline-none"
              />
              <div className="flex justify-end gap-3 mt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!urlValue.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-brand-navy hover:bg-primary-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Image
                </button>
              </div>
            </form>
          )}

          {/* Cancel button for upload tab */}
          {activeTab === 'upload' && onUpload && (
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Video Upload Modal - supports URL embed (YouTube, Vimeo, Loom) or file upload
function VideoUploadModal({ isOpen, onClose, onSubmit, onUpload }) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('url'); // 'url' or 'upload'
  const [urlValue, setUrlValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);
  const urlInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setUrlValue('');
      setUploading(false);
      setPreviewUrl(null);
      setTimeout(() => urlInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Check URL and update preview
  useEffect(() => {
    const embedUrl = getVideoEmbedUrl(urlValue);
    setPreviewUrl(embedUrl);
  }, [urlValue]);

  const handleFileSelect = async (file) => {
    if (!file || !onUpload) return;

    // Validate file type
    if (!file.type.startsWith('video/')) {
      toast.error('Please select a video file');
      return;
    }

    // Validate file size (100MB max for videos)
    if (file.size > 100 * 1024 * 1024) {
      toast.error('File size must be less than 100MB');
      return;
    }

    setUploading(true);
    try {
      const url = await onUpload(file);
      if (url) {
        onSubmit(url);
        onClose();
      }
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error('Failed to upload video. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleUrlSubmit = (e) => {
    e.preventDefault();
    if (urlValue.trim()) {
      onSubmit(urlValue.trim());
      onClose();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">Add Video</h3>

          {/* Tab buttons */}
          <div className="flex border-b border-neutral-200 mb-4">
            <button
              type="button"
              onClick={() => setActiveTab('url')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'url'
                  ? 'border-brand-navy text-brand-navy'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Embed URL
            </button>
            {onUpload && (
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'upload'
                    ? 'border-brand-navy text-brand-navy'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}
              >
                Upload File
              </button>
            )}
          </div>

          {/* URL tab content */}
          {activeTab === 'url' && (
            <form onSubmit={handleUrlSubmit}>
              <div className="space-y-4">
                <div>
                  <input
                    ref={urlInputRef}
                    type="text"
                    value={urlValue}
                    onChange={(e) => setUrlValue(e.target.value)}
                    placeholder="Paste YouTube, Vimeo, or Loom URL..."
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-navy/20 focus:border-brand-navy outline-none"
                  />
                  <p className="text-xs text-neutral-400 mt-1">
                    Supports YouTube, Vimeo, and Loom videos
                  </p>
                </div>

                {/* Preview */}
                {previewUrl && (
                  <div className="aspect-video rounded-lg overflow-hidden bg-neutral-100 border border-neutral-200">
                    <iframe
                      src={previewUrl}
                      className="w-full h-full"
                      allowFullScreen
                      allow="autoplay; fullscreen; picture-in-picture"
                    />
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!urlValue.trim() || !previewUrl}
                    className="px-4 py-2 text-sm font-medium text-white bg-brand-navy hover:bg-primary-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add Video
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Upload tab content */}
          {activeTab === 'upload' && onUpload && (
            <div>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => !uploading && fileInputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                  ${dragOver ? 'border-brand-navy bg-brand-navy/5' : 'border-neutral-300 hover:border-brand-navy hover:bg-neutral-50'}
                  ${uploading ? 'opacity-50 cursor-wait' : ''}
                `}
              >
                <VideoCameraIcon className="h-12 w-12 mx-auto text-neutral-400" />
                <p className="mt-2 text-sm text-neutral-600">
                  {uploading ? 'Uploading...' : 'Click to upload or drag and drop'}
                </p>
                <p className="text-xs text-neutral-400 mt-1">MP4, WebM, MOV up to 100MB</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
                className="hidden"
              />
              <div className="flex justify-end mt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Gmail-style Text & Background Color Picker
function TextColorPicker({ editor }) {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef(null);

  // Close picker when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get current colors
  const currentTextColor = editor.getAttributes('textStyle').color;
  const currentHighlight = editor.getAttributes('highlight').color;

  const applyTextColor = (color) => {
    if (color === null) {
      editor.chain().focus().unsetColor().run();
    } else {
      editor.chain().focus().setColor(color).run();
    }
  };

  const applyHighlight = (color) => {
    if (color === null) {
      editor.chain().focus().unsetHighlight().run();
    } else {
      editor.chain().focus().setHighlight({ color }).run();
    }
  };

  // Color swatch component
  const ColorSwatch = ({ color, isSelected, onClick, isNone }) => (
    <button
      type="button"
      onClick={onClick}
      className={`
        w-[18px] h-[18px] rounded-sm transition-all
        ${isSelected ? 'ring-2 ring-brand-navy ring-offset-1' : 'hover:ring-1 hover:ring-neutral-400'}
        ${isNone ? 'border border-neutral-300 relative overflow-hidden' : ''}
      `}
      style={!isNone ? { backgroundColor: color } : undefined}
    >
      {isNone && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-full h-[1px] bg-red-500 rotate-45 absolute" />
        </div>
      )}
    </button>
  );

  // Color grid for one panel
  const ColorGrid = ({ onColorSelect, currentColor, type }) => (
    <div className="space-y-1">
      {/* Grays row with "none" option */}
      <div className="flex gap-[2px]">
        <ColorSwatch
          isNone
          isSelected={!currentColor}
          onClick={() => onColorSelect(null)}
        />
        {COLOR_PALETTE.grays.slice(0, 9).map((color) => (
          <ColorSwatch
            key={color}
            color={color}
            isSelected={currentColor === color}
            onClick={() => onColorSelect(color)}
          />
        ))}
      </div>
      {/* Bright colors row */}
      <div className="flex gap-[2px]">
        {COLOR_PALETTE.brights.map((color) => (
          <ColorSwatch
            key={color}
            color={color}
            isSelected={currentColor === color}
            onClick={() => onColorSelect(color)}
          />
        ))}
      </div>
      {/* Gradient grid */}
      {COLOR_PALETTE.gradient.map((row, rowIndex) => (
        <div key={rowIndex} className="flex gap-[2px]">
          {row.map((color) => (
            <ColorSwatch
              key={color}
              color={color}
              isSelected={currentColor === color}
              onClick={() => onColorSelect(color)}
            />
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <div className="relative" ref={pickerRef}>
      {/* Trigger button - styled like an "A" with underline color */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Text & highlight color"
        className="flex items-center gap-0.5 p-2 rounded-lg transition-colors text-neutral-600 hover:bg-neutral-100"
      >
        <div className="relative flex flex-col items-center">
          <span className="text-sm font-bold leading-none">A</span>
          {/* Current text color indicator */}
          <div
            className="w-4 h-1 rounded-sm mt-0.5"
            style={{ backgroundColor: currentTextColor || '#000000' }}
          />
        </div>
        <ChevronDownIcon className="h-3 w-3" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl border border-neutral-200 p-3 z-50">
          <div className="flex gap-4">
            {/* Background color panel */}
            <div>
              <div className="text-xs font-medium text-neutral-700 mb-2">Background color</div>
              <ColorGrid
                onColorSelect={applyHighlight}
                currentColor={currentHighlight}
                type="background"
              />
            </div>

            {/* Divider */}
            <div className="w-px bg-neutral-200" />

            {/* Text color panel */}
            <div>
              <div className="text-xs font-medium text-neutral-700 mb-2">Text color</div>
              <ColorGrid
                onColorSelect={applyTextColor}
                currentColor={currentTextColor}
                type="text"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Menu Bar Component
function MenuBar({ editor, onUpload }) {
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [linkDefaultValue, setLinkDefaultValue] = useState('');

  if (!editor) return null;

  const openLinkModal = () => {
    const previousUrl = editor.getAttributes('link').href || '';
    setLinkDefaultValue(previousUrl);
    setLinkModalOpen(true);
  };

  const handleLinkSubmit = (url) => {
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const handleImageSubmit = (url) => {
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const handleVideoSubmit = (url) => {
    if (url) {
      editor.chain().focus().setVideo({ src: url }).run();
    }
  };

  return (
    <>
      {/* Link Modal */}
      <InputModal
        isOpen={linkModalOpen}
        onClose={() => setLinkModalOpen(false)}
        onSubmit={handleLinkSubmit}
        title="Add Link"
        placeholder="https://example.com"
        defaultValue={linkDefaultValue}
        submitLabel="Add Link"
      />

      {/* Image Modal - supports both upload and URL */}
      <ImageUploadModal
        isOpen={imageModalOpen}
        onClose={() => setImageModalOpen(false)}
        onSubmit={handleImageSubmit}
        onUpload={onUpload}
      />

      {/* Video Modal - supports embed URL and file upload */}
      <VideoUploadModal
        isOpen={videoModalOpen}
        onClose={() => setVideoModalOpen(false)}
        onSubmit={handleVideoSubmit}
        onUpload={onUpload}
      />


    <div className="flex flex-wrap items-center gap-0.5 p-2 border-b border-neutral-200 bg-neutral-50">
      {/* Text Style */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title="Bold (Cmd+B)"
      >
        <BoldIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title="Italic (Cmd+I)"
      >
        <ItalicIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive('underline')}
        title="Underline (Cmd+U)"
      >
        <UnderlineIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        title="Strikethrough"
      >
        <StrikethroughIcon className="h-4 w-4" />
      </ToolbarButton>
      <TextColorPicker editor={editor} />

      <ToolbarDivider />

      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setParagraph().run()}
        isActive={editor.isActive('paragraph')}
        title="Paragraph"
      >
        <ParagraphIcon />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive('heading', { level: 1 })}
        title="Heading 1"
      >
        <H1Icon />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive('heading', { level: 2 })}
        title="Heading 2"
      >
        <H2Icon />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive('heading', { level: 3 })}
        title="Heading 3"
      >
        <H3Icon />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        title="Bullet List"
      >
        <ListBulletIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        title="Numbered List"
      >
        <NumberedListIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        title="Blockquote"
      >
        <ChatBubbleBottomCenterTextIcon className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Text Alignment */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        isActive={editor.isActive({ textAlign: 'left' })}
        title="Align Left"
      >
        <Bars3BottomLeftIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        isActive={editor.isActive({ textAlign: 'center' })}
        title="Align Center"
      >
        <Bars3Icon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        isActive={editor.isActive({ textAlign: 'right' })}
        title="Align Right"
      >
        <Bars3BottomRightIcon className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Links & Media */}
      <ToolbarButton
        onClick={openLinkModal}
        isActive={editor.isActive('link')}
        title="Add Link"
      >
        <LinkIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => setImageModalOpen(true)}
        title="Add Image"
      >
        <PhotoIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => setVideoModalOpen(true)}
        title="Add Video"
      >
        <VideoCameraIcon className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Undo/Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo (Cmd+Z)"
      >
        <ArrowUturnLeftIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo (Cmd+Shift+Z)"
      >
        <ArrowUturnRightIcon className="h-4 w-4" />
      </ToolbarButton>
    </div>
    </>
  );
}

// Main Editor Component
export default function AcademyRichTextEditor({
  content = '',
  onChange,
  onUpload,
  placeholder = 'Start writing...',
  minHeight = '300px',
  className = '',
}) {
  // Force re-render when selection changes so toolbar updates
  const [, setSelectionUpdate] = useState(0);

  // Convert markdown to HTML on initial load
  const initialContent = useMemo(() => prepareContent(content), []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-brand-navy underline hover:text-primary-600',
        },
      }),
      ResizableImage.configure({
        HTMLAttributes: {
          class: 'max-w-full rounded-lg my-4',
        },
      }),
      VideoEmbed,
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Highlight.configure({
        multicolor: true,
      }),
      TextStyle,
      Color,
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'border-collapse border border-neutral-200',
        },
      }),
      TableRow,
      TableHeader.configure({
        HTMLAttributes: {
          class: 'bg-neutral-50 font-semibold text-left p-3 border border-neutral-200',
        },
      }),
      TableCell.configure({
        HTMLAttributes: {
          class: 'p-3 border border-neutral-200',
        },
      }),
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      if (onChange) {
        onChange(editor.getHTML());
      }
    },
    onSelectionUpdate: () => {
      // Force toolbar to re-render when selection changes
      setSelectionUpdate(n => n + 1);
    },
    editorProps: {
      attributes: {
        class: `prose prose-slate max-w-none p-4 focus:outline-none min-h-[${minHeight}]`,
        style: `min-height: ${minHeight}`,
      },
    },
  });

  // Update content when prop changes (also convert markdown)
  useEffect(() => {
    if (editor && content) {
      const preparedContent = prepareContent(content);
      if (preparedContent !== editor.getHTML()) {
        editor.commands.setContent(preparedContent);
      }
    }
  }, [content, editor]);

  return (
    <div className={`border border-neutral-200 rounded-lg bg-white overflow-hidden ${className}`}>
      <MenuBar editor={editor} onUpload={onUpload} />
      <EditorContent editor={editor} />

      {/* Custom styles for the editor */}
      <style>{`
        .ProseMirror {
          min-height: ${minHeight};
          padding: 1rem;
        }
        .ProseMirror:focus {
          outline: none;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          color: #9ca3af;
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
        .ProseMirror h1 {
          font-size: 1.875rem;
          font-weight: 700;
          line-height: 1.2;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .ProseMirror h2 {
          font-size: 1.5rem;
          font-weight: 600;
          line-height: 1.3;
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
        }
        .ProseMirror h3 {
          font-size: 1.25rem;
          font-weight: 600;
          line-height: 1.4;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }
        .ProseMirror p {
          margin-bottom: 0.75rem;
        }
        .ProseMirror ul,
        .ProseMirror ol {
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .ProseMirror ul {
          list-style-type: disc;
        }
        .ProseMirror ol {
          list-style-type: decimal;
        }
        .ProseMirror li {
          margin-bottom: 0.25rem;
        }
        .ProseMirror blockquote {
          border-left: 3px solid #2D2F8E;
          padding-left: 1rem;
          margin: 1rem 0;
          font-style: italic;
          color: #64748b;
        }
        .ProseMirror img {
          max-width: 100%;
          border-radius: 0.5rem;
          margin: 1rem 0;
        }
        .ProseMirror mark {
          padding: 0.125rem 0.25rem;
          border-radius: 0.125rem;
        }
        .ProseMirror a {
          color: #2D2F8E;
          text-decoration: underline;
        }
        .ProseMirror a:hover {
          color: #3a3c9e;
        }
        .ProseMirror hr {
          border: none;
          border-top: 2px solid #e2e8f0;
          margin: 1.5rem 0;
        }
        .ProseMirror code {
          background-color: #f1f5f9;
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-size: 0.875rem;
          font-family: monospace;
        }
        .ProseMirror pre {
          background-color: #1e293b;
          color: #e2e8f0;
          padding: 1rem;
          border-radius: 0.5rem;
          overflow-x: auto;
          margin: 1rem 0;
        }
        .ProseMirror pre code {
          background: none;
          padding: 0;
          color: inherit;
        }
        /* Table styles */
        .ProseMirror table {
          border-collapse: collapse;
          width: 100%;
          margin: 1rem 0;
          overflow: hidden;
          table-layout: fixed;
        }
        .ProseMirror th,
        .ProseMirror td {
          border: 1px solid #e2e8f0;
          padding: 0.5rem 0.75rem;
          position: relative;
          vertical-align: top;
          text-align: left;
          min-width: 80px;
        }
        .ProseMirror th {
          background-color: #f8fafc;
          font-weight: 600;
          color: #1e293b;
        }
        .ProseMirror td {
          color: #475569;
        }
        .ProseMirror .selectedCell:after {
          background: rgba(45, 47, 142, 0.1);
          content: "";
          left: 0;
          right: 0;
          top: 0;
          bottom: 0;
          pointer-events: none;
          position: absolute;
          z-index: 2;
        }
        .ProseMirror .column-resize-handle {
          background-color: #2D2F8E;
          bottom: -2px;
          pointer-events: none;
          position: absolute;
          right: -2px;
          top: 0;
          width: 4px;
        }
        .ProseMirror.resize-cursor {
          cursor: col-resize;
        }
      `}</style>
    </div>
  );
}

/**
 * RichTextViewer - Read-only renderer for HTML/Markdown content
 * Use this to display saved content in a beautiful format
 * Automatically detects and converts markdown to HTML
 */
export function RichTextViewer({ content, className = '' }) {
  // Prepare content - converts markdown to HTML if needed
  const htmlContent = useMemo(() => prepareContent(content), [content]);

  if (!content) {
    return <p className="text-neutral-500 italic">No content available</p>;
  }

  return (
    <div className={`prose prose-slate max-w-none ${className}`}>
      <div
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(htmlContent) }}
        className="rich-text-content"
      />
      <style>{`
        .rich-text-content h1 {
          font-size: 1.875rem;
          font-weight: 700;
          line-height: 1.2;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
          color: #1e293b;
        }
        .rich-text-content h2 {
          font-size: 1.5rem;
          font-weight: 600;
          line-height: 1.3;
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
          color: #1e293b;
        }
        .rich-text-content h3 {
          font-size: 1.25rem;
          font-weight: 600;
          line-height: 1.4;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
          color: #1e293b;
        }
        .rich-text-content p {
          margin-bottom: 0.75rem;
          color: #475569;
          line-height: 1.7;
        }
        .rich-text-content ul,
        .rich-text-content ol {
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .rich-text-content ul {
          list-style-type: disc;
        }
        .rich-text-content ol {
          list-style-type: decimal;
        }
        .rich-text-content li {
          margin-bottom: 0.25rem;
          color: #475569;
        }
        .rich-text-content blockquote {
          border-left: 3px solid #2D2F8E;
          padding-left: 1rem;
          margin: 1rem 0;
          font-style: italic;
          color: #64748b;
        }
        .rich-text-content img {
          max-width: 100%;
          border-radius: 0.5rem;
          margin: 1rem 0;
        }
        .rich-text-content mark {
          padding: 0.125rem 0.25rem;
          border-radius: 0.125rem;
        }
        .rich-text-content a {
          color: #2D2F8E;
          text-decoration: underline;
        }
        .rich-text-content a:hover {
          color: #3a3c9e;
        }
        .rich-text-content hr {
          border: none;
          border-top: 2px solid #e2e8f0;
          margin: 1.5rem 0;
        }
        .rich-text-content code {
          background-color: #f1f5f9;
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-size: 0.875rem;
          font-family: monospace;
        }
        .rich-text-content pre {
          background-color: #1e293b;
          color: #e2e8f0;
          padding: 1rem;
          border-radius: 0.5rem;
          overflow-x: auto;
          margin: 1rem 0;
        }
        .rich-text-content pre code {
          background: none;
          padding: 0;
          color: inherit;
        }
        .rich-text-content strong {
          font-weight: 600;
          color: #1e293b;
        }
        .rich-text-content em {
          font-style: italic;
        }
        .rich-text-content u {
          text-decoration: underline;
        }
        .rich-text-content s {
          text-decoration: line-through;
        }
        /* Table styles */
        .rich-text-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 1rem 0;
          font-size: 0.875rem;
        }
        .rich-text-content thead {
          background-color: #f8fafc;
        }
        .rich-text-content th {
          padding: 0.75rem 1rem;
          text-align: left;
          font-weight: 600;
          color: #1e293b;
          border-bottom: 2px solid #e2e8f0;
        }
        .rich-text-content td {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #e2e8f0;
          color: #475569;
        }
        .rich-text-content tr:hover {
          background-color: #f8fafc;
        }
        .rich-text-content tbody tr:last-child td {
          border-bottom: none;
        }

        /* Image sizing and alignment */
        .rich-text-content img[data-size="small"] {
          width: 25%;
        }
        .rich-text-content img[data-size="medium"] {
          width: 50%;
        }
        .rich-text-content img[data-size="large"] {
          width: 75%;
        }
        .rich-text-content img[data-size="full"] {
          width: 100%;
        }
        .rich-text-content img[data-align="left"] {
          float: left;
          margin-right: 1rem;
          margin-bottom: 0.5rem;
        }
        .rich-text-content img[data-align="center"] {
          display: block;
          margin-left: auto;
          margin-right: auto;
        }
        .rich-text-content img[data-align="right"] {
          float: right;
          margin-left: 1rem;
          margin-bottom: 0.5rem;
        }

        /* Video embed styles */
        .rich-text-content .video-embed {
          margin: 1rem 0;
          clear: both;
        }
        .rich-text-content .video-embed .video-iframe {
          width: 100%;
          aspect-ratio: 16/9;
          border-radius: 0.5rem;
          border: none;
        }
        .rich-text-content .video-size-small {
          width: 25%;
        }
        .rich-text-content .video-size-medium {
          width: 50%;
        }
        .rich-text-content .video-size-large {
          width: 75%;
        }
        .rich-text-content .video-size-full {
          width: 100%;
        }
        .rich-text-content .video-align-left {
          margin-right: auto;
        }
        .rich-text-content .video-align-center {
          margin-left: auto;
          margin-right: auto;
        }
        .rich-text-content .video-align-right {
          margin-left: auto;
        }

        /* Clear floats */
        .rich-text-content::after {
          content: "";
          display: table;
          clear: both;
        }
      `}</style>
    </div>
  );
}
