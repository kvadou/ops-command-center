import React, { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import {
  DocumentTextIcon,
  ArrowTopRightOnSquareIcon,
  DocumentArrowDownIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

/**
 * DocumentModule - Rich text/markdown display component for academy modules
 *
 * Supports:
 * - Content blocks (new format from Content Manager)
 * - JSON content with sections (title, content)
 * - Plain text/markdown content
 * - Attachments list
 * - Interactive checklists with database sync
 */
export default function DocumentModule({ content, contentBlocks, attachments, moduleId }) {
  // State for tracking embedded checklist completion (synced with database)
  const [checklistState, setChecklistState] = useState({});
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [togglingItem, setTogglingItem] = useState(null);

  // Load checklist state from API on mount
  useEffect(() => {
    if (moduleId) {
      fetchChecklistProgress();
    }
  }, [moduleId]);

  // Fetch checklist progress from API
  const fetchChecklistProgress = async () => {
    if (!moduleId) return;

    setLoadingChecklist(true);
    try {
      const response = await fetch(`/api/academy/modules/${moduleId}/embedded-checklist-progress`);
      if (response.ok) {
        const data = await response.json();
        // Convert API format to local format (key -> boolean)
        const stateObj = {};
        Object.keys(data).forEach(key => {
          stateObj[key] = data[key].is_completed;
        });
        setChecklistState(stateObj);
      }
    } catch (e) {
      console.error('Error loading checklist state from API:', e);
      // Fallback to localStorage if API fails
      try {
        const storageKey = `academy_checklist_${moduleId}`;
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          setChecklistState(JSON.parse(saved));
        }
      } catch (localErr) {
        console.error('Error loading from localStorage fallback:', localErr);
      }
    } finally {
      setLoadingChecklist(false);
    }
  };

  // Toggle checklist item completion via API
  const handleChecklistToggle = async (blockId, itemIndex) => {
    const key = `${blockId}_${itemIndex}`;

    // Optimistic update
    const previousState = checklistState[key];
    setChecklistState(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
    setTogglingItem(key);

    try {
      const response = await fetch(`/api/academy/modules/${moduleId}/embedded-checklist/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockId: String(blockId), itemIndex }),
      });

      if (!response.ok) {
        throw new Error('Failed to toggle checklist item');
      }

      const result = await response.json();
      // Update with server response
      setChecklistState(prev => ({
        ...prev,
        [key]: result.is_completed,
      }));
    } catch (e) {
      console.error('Error toggling checklist item:', e);
      // Revert on error
      setChecklistState(prev => ({
        ...prev,
        [key]: previousState,
      }));
    } finally {
      setTogglingItem(null);
    }
  };

  // Handle different content formats
  const renderContent = () => {
    // If we have content_blocks, render them (new format)
    if (contentBlocks && Array.isArray(contentBlocks) && contentBlocks.length > 0) {
      return (
        <div className="divide-y divide-neutral-100">
          {contentBlocks.map((block, index) => (
            <div key={block.id || index} className="p-6 sm:p-8">
              {block.title && (
                <h3 className="text-lg font-semibold text-neutral-900 mb-4">
                  {block.title}
                </h3>
              )}
              {block.type === 'text' && block.content && (
                <div className="prose prose-slate prose-sm sm:prose max-w-none">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(formatContent(block.content)),
                    }}
                  />
                </div>
              )}
              {block.type === 'video' && block.url && (
                <div className="aspect-video">
                  <iframe
                    src={getVideoEmbedUrl(block.url)}
                    className="w-full h-full rounded-lg"
                    allowFullScreen
                  />
                </div>
              )}
              {block.type === 'image' && block.url && (
                <div className="my-4">
                  <img
                    src={block.url}
                    alt={block.caption || block.alt || 'Image'}
                    className="max-w-full rounded-lg"
                  />
                  {block.caption && (
                    <p className="text-sm text-neutral-500 mt-2 text-center">{block.caption}</p>
                  )}
                </div>
              )}
              {block.type === 'callout' && (
                <div className={`p-4 rounded-lg ${getCalloutStyles(block.calloutType)}`}>
                  {block.title && (
                    <h4 className="font-semibold mb-2">{block.title}</h4>
                  )}
                  <div
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(formatContent(block.content || '')),
                    }}
                  />
                </div>
              )}
              {block.type === 'checklist' && (
                <div className="bg-neutral-50 rounded-lg p-4">
                  {block.description && (
                    <p className="text-sm text-neutral-600 mb-4">{block.description}</p>
                  )}
                  {loadingChecklist ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-neutral-300 border-t-brand-navy" />
                      <span className="ml-2 text-sm text-neutral-500">Loading progress...</span>
                    </div>
                  ) : block.items && block.items.length > 0 ? (
                    <ul className="space-y-2">
                      {block.items.map((item, itemIndex) => {
                        const blockId = block.id || index;
                        const key = `${blockId}_${itemIndex}`;
                        const isChecked = checklistState[key] || false;
                        const isToggling = togglingItem === key;
                        return (
                          <li
                            key={itemIndex}
                            onClick={() => !isToggling && handleChecklistToggle(blockId, itemIndex)}
                            className={`
                              flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all duration-200
                              ${isToggling ? 'opacity-70' : ''}
                              ${isChecked
                                ? 'bg-emerald-50 border-emerald-200'
                                : 'bg-white border-neutral-200 hover:border-neutral-300'
                              }
                            `}
                          >
                            <button
                              disabled={isToggling}
                              className={`
                                flex-shrink-0 w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center transition-all duration-200
                                ${isChecked
                                  ? 'bg-emerald-500 border-emerald-500 text-white'
                                  : 'border-neutral-300 bg-white hover:border-emerald-400'
                                }
                              `}
                            >
                              {isToggling ? (
                                <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent" />
                              ) : isChecked ? (
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              ) : null}
                            </button>
                            <span className={`${isChecked ? 'text-neutral-500 line-through' : 'text-neutral-700'}`}>
                              {item.text || item.title || (typeof item === 'string' ? item : '')}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  {(block.dueDay || block.points) && (
                    <div className="flex gap-4 mt-4 pt-3 border-t border-neutral-200 text-sm text-neutral-500">
                      {block.dueDay && <span>Due: Day {block.dueDay}</span>}
                      {block.points && <span>{block.points} points</span>}
                    </div>
                  )}
                  {/* Completion summary */}
                  {block.items && block.items.length > 0 && !loadingChecklist && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-neutral-200 text-sm">
                      <span className="text-neutral-600">
                        {block.items.filter((_, idx) => checklistState[`${block.id || index}_${idx}`]).length} of {block.items.length} completed
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }

    if (!content) {
      return (
        <div className="p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-neutral-100 rounded-xl flex items-center justify-center">
            <DocumentTextIcon className="h-8 w-8 text-neutral-400" />
          </div>
          <p className="text-neutral-500">Content is being prepared.</p>
        </div>
      );
    }

    // If content is a string, check if it's JSON that needs parsing
    if (typeof content === 'string') {
      const trimmed = content.trim();

      // Check if it looks like JSON
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(content);

          // If it's an object with sections, render those
          if (parsed.sections && Array.isArray(parsed.sections)) {
            return (
              <div className="divide-y divide-neutral-100">
                {parsed.sections.map((section, index) => (
                  <div key={index} className="p-6 sm:p-8">
                    {section.title && (
                      <h3 className="text-lg font-semibold text-neutral-900 mb-4">
                        {section.title}
                      </h3>
                    )}
                    {section.content && (
                      <div className="prose prose-slate prose-sm sm:prose max-w-none">
                        <div
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(formatMarkdown(section.content)),
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          }

          // If it has description
          if (parsed.description) {
            return (
              <div className="p-6 sm:p-8">
                <div className="prose prose-slate prose-sm sm:prose max-w-none">
                  <p>{parsed.description}</p>
                </div>
              </div>
            );
          }
        } catch {
          // Not valid JSON, continue to render as text/markdown
        }
      }

      // Render as plain text or markdown
      return (
        <div className="p-6 sm:p-8">
          <div className="prose prose-slate prose-sm sm:prose max-w-none">
            <div
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(formatMarkdown(content)),
              }}
            />
          </div>
        </div>
      );
    }

    // If content is JSON with sections
    if (content.sections && Array.isArray(content.sections)) {
      return (
        <div className="divide-y divide-neutral-100">
          {content.sections.map((section, index) => (
            <div key={index} className="p-6 sm:p-8">
              {section.title && (
                <h3 className="text-lg font-semibold text-neutral-900 mb-4">
                  {section.title}
                </h3>
              )}
              {section.content && (
                <div className="prose prose-slate prose-sm sm:prose max-w-none">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(formatMarkdown(section.content)),
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }

    // If content has description (video-style content)
    if (content.description) {
      return (
        <div className="p-6 sm:p-8">
          <div className="prose prose-slate prose-sm sm:prose max-w-none">
            <p>{content.description}</p>
          </div>
        </div>
      );
    }

    // If content is a TipTap JSON structure
    if (content.type === 'doc' && content.content) {
      return (
        <div className="p-6 sm:p-8">
          <div className="prose prose-slate prose-sm sm:prose max-w-none">
            {renderTipTapContent(content.content)}
          </div>
        </div>
      );
    }

    // Fallback: try to display as JSON
    return (
      <div className="p-6 sm:p-8">
        <div className="bg-neutral-50 rounded-lg p-4">
          <pre className="text-xs text-neutral-600 whitespace-pre-wrap">
            {JSON.stringify(content, null, 2)}
          </pre>
        </div>
      </div>
    );
  };

  // Simple markdown to HTML converter
  const formatMarkdown = (text) => {
    if (!text) return '';

    let html = text
      // Escape HTML first
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Headers
      .replace(/^### (.*)$/gm, '<h4>$1</h4>')
      .replace(/^## (.*)$/gm, '<h3>$1</h3>')
      .replace(/^# (.*)$/gm, '<h2>$1</h2>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      // Unordered lists
      .replace(/^- (.*)$/gm, '<li>$1</li>')
      // Ordered lists
      .replace(/^\d+\. (.*)$/gm, '<li>$1</li>')
      // Line breaks
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br />');

    // Wrap loose list items in ul
    html = html.replace(/(<li>.*<\/li>)+/gs, (match) => `<ul>${match}</ul>`);

    // Wrap in paragraph tags if not starting with a header
    if (!html.startsWith('<h') && !html.startsWith('<ul')) {
      html = `<p>${html}</p>`;
    }

    return html;
  };

  // Format content - handles HTML or converts markdown
  const formatContent = (content) => {
    if (!content) return '';

    // If content already looks like HTML (from TipTap), return as-is
    if (content.trim().startsWith('<')) {
      return content;
    }

    // Otherwise convert from markdown
    return formatMarkdown(content);
  };

  // Get video embed URL
  const getVideoEmbedUrl = (url) => {
    if (!url) return '';

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

    return url;
  };

  // Get callout styles based on type
  const getCalloutStyles = (type) => {
    switch (type) {
      case 'tip':
        return 'bg-green-50 border-l-4 border-green-500 text-green-800';
      case 'warning':
        return 'bg-amber-50 border-l-4 border-amber-500 text-amber-800';
      case 'info':
        return 'bg-blue-50 border-l-4 border-blue-500 text-blue-800';
      case 'error':
        return 'bg-red-50 border-l-4 border-red-500 text-red-800';
      default:
        return 'bg-neutral-50 border-l-4 border-neutral-500 text-neutral-800';
    }
  };

  // Render TipTap JSON content (simplified)
  const renderTipTapContent = (nodes) => {
    if (!nodes || !Array.isArray(nodes)) return null;

    return nodes.map((node, index) => {
      switch (node.type) {
        case 'paragraph':
          return (
            <p key={index}>
              {node.content?.map((c, i) => renderTipTapNode(c, i)) || ''}
            </p>
          );
        case 'heading':
          const Tag = `h${node.attrs?.level || 2}`;
          return (
            <Tag key={index}>
              {node.content?.map((c, i) => renderTipTapNode(c, i)) || ''}
            </Tag>
          );
        case 'bulletList':
          return (
            <ul key={index}>
              {node.content?.map((item, i) => (
                <li key={i}>
                  {item.content?.map((p, j) =>
                    p.content?.map((c, k) => renderTipTapNode(c, k)) || ''
                  )}
                </li>
              ))}
            </ul>
          );
        case 'orderedList':
          return (
            <ol key={index}>
              {node.content?.map((item, i) => (
                <li key={i}>
                  {item.content?.map((p, j) =>
                    p.content?.map((c, k) => renderTipTapNode(c, k)) || ''
                  )}
                </li>
              ))}
            </ol>
          );
        default:
          return null;
      }
    });
  };

  const renderTipTapNode = (node, key) => {
    if (node.type === 'text') {
      let text = node.text;
      if (node.marks) {
        node.marks.forEach((mark) => {
          switch (mark.type) {
            case 'bold':
              text = <strong key={key}>{text}</strong>;
              break;
            case 'italic':
              text = <em key={key}>{text}</em>;
              break;
            case 'link':
              text = (
                <a
                  key={key}
                  href={mark.attrs.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {text}
                </a>
              );
              break;
            default:
              break;
          }
        });
      }
      return text;
    }
    return null;
  };

  return (
    <div className="document-module-content">
      {renderContent()}

      {/* Image and video sizing/alignment styles */}
      <style>{`
        .document-module-content img[data-size="small"] {
          width: 25%;
        }
        .document-module-content img[data-size="medium"] {
          width: 50%;
        }
        .document-module-content img[data-size="large"] {
          width: 75%;
        }
        .document-module-content img[data-size="full"] {
          width: 100%;
        }
        .document-module-content img[data-align="left"] {
          float: left;
          margin-right: 1rem;
          margin-bottom: 0.5rem;
        }
        .document-module-content img[data-align="center"] {
          display: block;
          margin-left: auto;
          margin-right: auto;
        }
        .document-module-content img[data-align="right"] {
          float: right;
          margin-left: 1rem;
          margin-bottom: 0.5rem;
        }
        .document-module-content .video-embed {
          margin: 1rem 0;
          clear: both;
        }
        .document-module-content .video-embed .video-iframe {
          width: 100%;
          aspect-ratio: 16/9;
          border-radius: 0.5rem;
          border: none;
        }
        .document-module-content .video-size-small {
          width: 25%;
        }
        .document-module-content .video-size-medium {
          width: 50%;
        }
        .document-module-content .video-size-large {
          width: 75%;
        }
        .document-module-content .video-size-full {
          width: 100%;
        }
        .document-module-content .video-align-left {
          margin-right: auto;
        }
        .document-module-content .video-align-center {
          margin-left: auto;
          margin-right: auto;
        }
        .document-module-content .video-align-right {
          margin-left: auto;
        }
        .document-module-content .prose::after {
          content: "";
          display: table;
          clear: both;
        }
      `}</style>

      {/* Attachments */}
      {attachments && attachments.length > 0 && (
        <div className="border-t border-neutral-100 p-6">
          <h4 className="text-sm font-semibold text-neutral-900 mb-3">Attachments</h4>
          <div className="space-y-2">
            {attachments.map((attachment, index) => (
              <a
                key={index}
                href={attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg hover:bg-neutral-100 transition-colors group"
              >
                <div className="p-2 bg-white rounded-lg border border-neutral-200">
                  <DocumentArrowDownIcon className="h-5 w-5 text-brand-navy" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-neutral-900 truncate">
                    {attachment.name || 'Download'}
                  </p>
                  {attachment.size && (
                    <p className="text-xs text-neutral-500">
                      {formatFileSize(attachment.size)}
                    </p>
                  )}
                </div>
                <ArrowTopRightOnSquareIcon className="h-4 w-4 text-neutral-400 group-hover:text-brand-navy transition-colors" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
