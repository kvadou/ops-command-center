import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useCompanyName } from '../contexts/CompanyNameContext';
import KnowledgeComments from './KnowledgeComments';
import { ChecklistDisplay } from './knowledge';
import {
  ClockIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  PlayIcon,
  PencilSquareIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';

/**
 * KnowledgeArticlePage - Display full article with content, attachments, comments
 */
export default function KnowledgeArticlePage() {
  const navigate = useNavigate();
  const { articleId } = useParams();
  const { companyName, isMainBranch } = useCompanyName();
  const [article, setArticle] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchArticle();
  }, [articleId]);

  const fetchArticle = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/knowledge/articles/${articleId}`);
      const data = await response.json();
      setArticle(data.article);
      setAttachments(data.attachments || []);
    } catch (error) {
      console.error('Error fetching article:', error);
    } finally {
      setLoading(false);
    }
  };


  const renderContent = (content) => {
    if (!content) return null;
    
    let json = content;
    if (typeof content === 'string') {
      try {
        json = JSON.parse(content);
      } catch (e) {
        return <p className="text-neutral-700">{content}</p>;
      }
    }
    
    // Helper to render text with marks (bold, italic, links, etc.)
    const renderTextWithMarks = (node) => {
      if (!node.text) return null;
      
      let text = node.text;
      
      if (node.marks) {
        node.marks.forEach(mark => {
          if (mark.type === 'bold') {
            text = <strong className="font-semibold">{text}</strong>;
          }
          if (mark.type === 'italic') {
            text = <em>{text}</em>;
          }
          if (mark.type === 'code') {
            text = <code className="bg-neutral-100 px-1 py-0.5 rounded text-sm font-mono">{text}</code>;
          }
          if (mark.type === 'link') {
            text = (
              <a
                href={mark.attrs?.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-purple underline hover:text-brand-navy"
              >
                {text}
              </a>
            );
          }
        });
      }
      
      return text;
    };

    // Render content for list items (inline, no paragraph margins)
    const renderListItemContent = (nodes) => {
      if (!nodes) return null;
      
      return nodes.map((node, i) => {
        if (node.type === 'paragraph') {
          // Render paragraph content inline for list items
          return (
            <span key={i}>
              {node.content?.map((child, j) => (
                <span key={j}>{renderTextWithMarks(child)}</span>
              ))}
            </span>
          );
        }
        if (node.text) {
          return <span key={i}>{renderTextWithMarks(node)}</span>;
        }
        return null;
      });
    };
    
    const renderNode = (node, key) => {
      if (!node) return null;
      
      if (node.type === 'paragraph') {
        return (
          <p key={key} className="mb-4 text-neutral-700 leading-relaxed">
            {node.content?.map((child, i) => (
              <span key={i}>{renderTextWithMarks(child)}</span>
            )) || ''}
          </p>
        );
      }
      
      if (node.type === 'heading') {
        const level = node.attrs?.level || 2;
        const Tag = `h${level}`;
        const classes = {
          1: 'text-3xl font-bold text-neutral-900 mb-4 mt-8',
          2: 'text-2xl font-bold text-neutral-900 mb-3 mt-6',
          3: 'text-xl font-semibold text-neutral-900 mb-2 mt-4',
        };
        return (
          <Tag key={key} className={classes[level]}>
            {node.content?.map((child, i) => (
              <span key={i}>{renderTextWithMarks(child)}</span>
            )) || ''}
          </Tag>
        );
      }
      
      if (node.type === 'bulletList') {
        return (
          <ul key={key} className="list-disc pl-6 mb-4 space-y-2">
            {node.content?.map((child, i) => renderNode(child, i)) || ''}
          </ul>
        );
      }
      
      if (node.type === 'orderedList') {
        return (
          <ol key={key} className="list-decimal pl-6 mb-4 space-y-2">
            {node.content?.map((child, i) => renderNode(child, i)) || ''}
          </ol>
        );
      }
      
      if (node.type === 'listItem') {
        return (
          <li key={key} className="text-neutral-700 leading-relaxed">
            {renderListItemContent(node.content)}
          </li>
        );
      }
      
      if (node.type === 'codeBlock') {
        return (
          <pre key={key} className="bg-neutral-900 text-neutral-100 p-4 rounded-lg mb-4 overflow-x-auto">
            <code>{node.content?.map((child) => child.text).join('') || ''}</code>
          </pre>
        );
      }
      
      if (node.type === 'blockquote') {
        return (
          <blockquote key={key} className="border-l-4 border-brand-purple pl-4 italic text-neutral-700 mb-4">
            {node.content?.map((child, i) => renderNode(child, i)) || ''}
          </blockquote>
        );
      }
      
      if (node.type === 'image') {
        return (
          <img
            key={key}
            src={node.attrs?.src}
            alt={node.attrs?.alt || ''}
            className="max-w-full h-auto rounded-lg mb-4"
          />
        );
      }
      
      if (node.type === 'hardBreak') {
        return <br key={key} />;
      }
      
      if (node.text) {
        return <span key={key}>{renderTextWithMarks(node)}</span>;
      }
      
      // Handle doc type (root)
      if (node.type === 'doc') {
        return node.content?.map((child, i) => renderNode(child, i));
      }
      
      return null;
    };
    
    return (
      <div className="prose max-w-none">
        {json.content?.map((node, i) => renderNode(node, i))}
      </div>
    );
  };

  const renderVideo = () => {
    if (!article?.video_url) return null;
    
    const videoUrl = article.video_url;
    const provider = article.video_provider;
    
    if (provider === 'loom' || videoUrl.includes('loom.com')) {
      const loomMatch = videoUrl.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
      if (loomMatch) {
        const videoId = loomMatch[1];
        return (
          <div className="mb-6">
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              <iframe
                src={`https://www.loom.com/embed/${videoId}`}
                frameBorder="0"
                allowFullScreen
                className="absolute top-0 left-0 w-full h-full rounded-lg"
              />
            </div>
          </div>
        );
      }
    }
    
    if (provider === 'youtube' || videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
      const youtubeMatch = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
      if (youtubeMatch) {
        const videoId = youtubeMatch[1];
        return (
          <div className="mb-6">
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              <iframe
                src={`https://www.youtube.com/embed/${videoId}`}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute top-0 left-0 w-full h-full rounded-lg"
              />
            </div>
          </div>
        );
      }
    }
    
    return (
      <div className="mb-6 bg-gradient-to-br from-brand-light/30 to-white rounded-lg border border-neutral-100 p-6 text-center">
        <PlayIcon className="mx-auto h-12 w-12 text-neutral-400 mb-3" />
        <p className="text-sm text-neutral-600 mb-3">Video content available</p>
        <a
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-purple hover:text-brand-navy underline"
        >
          Watch Video →
        </a>
      </div>
    );
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  };

  if (loading) {
    return (
        <div className="max-w-7xl mx-auto w-full text-center py-6">
          <p className="text-neutral-500">Loading article...</p>
        </div>
    );
  }

  if (!article) {
    return (
        <div className="max-w-7xl mx-auto w-full text-center py-6">
          <p className="text-neutral-500">Article not found</p>
          <Link
            to="/knowledge"
            className="mt-4 inline-block text-brand-purple hover:text-brand-navy"
          >
            ← Back to Knowledge Hub
          </Link>
        </div>
    );
  }

  // For franchisees (non-main branch), show full article content first, then checklist at bottom
  if (!isMainBranch) {
    return (
        <div className="max-w-4xl mx-auto w-full">
          {/* Back to Progress Link */}
          <Link
            to="/knowledge/my-progress"
            className="inline-flex items-center gap-2 text-sm text-brand-purple hover:text-brand-navy mb-6"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to My Progress
          </Link>

          {/* Article Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-neutral-900 font-heading mb-3">
              {article.title}
            </h1>
            {article.summary && (
              <p className="text-lg text-neutral-600 leading-relaxed">
                {article.summary}
              </p>
            )}
          </div>

          {/* Video Embed - Show at top */}
          {renderVideo()}

          {/* Article Content - Full content visible by default */}
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 sm:p-8 mb-6">
            <div className="prose max-w-none">
              {renderContent(article.content)}
            </div>
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 mb-6">
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">
                📎 Attachments & Resources
              </h3>
              <div className="space-y-2">
                {attachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    href={`/api/knowledge/attachments/${attachment.id}/download`}
                    download
                    className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg border border-neutral-200 hover:border-brand-purple hover:bg-brand-light/30 transition-all"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-neutral-900">
                        {attachment.file_name}
                      </p>
                      {attachment.description && (
                        <p className="text-xs text-neutral-500">{attachment.description}</p>
                      )}
                      {attachment.file_size && (
                        <p className="text-xs text-neutral-400 mt-1">
                          {formatFileSize(attachment.file_size)}
                        </p>
                      )}
                    </div>
                    <ArrowDownTrayIcon className="h-5 w-5 text-neutral-600 ml-4 flex-shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Onboarding Checklist - At the bottom */}
          <div className="mb-6">
            <ChecklistDisplay 
              articleId={article.id} 
              isMainBranch={false}
            />
          </div>

          {/* Comments */}
          <KnowledgeComments articleId={articleId} />
        </div>
    );
  }

  // Main branch view - show full article with all content
  return (
      <div className="max-w-4xl mx-auto w-full">
        {/* Breadcrumb */}
        <nav className="mb-6">
          <ol className="flex items-center gap-2 text-sm">
            <li>
              <Link to="/knowledge" className="text-brand-purple hover:text-brand-navy">
                Knowledge Hub
              </Link>
            </li>
            {article.collection_title && (
              <>
                <li className="text-neutral-400">→</li>
                <li>
                  <Link
                    to={`/knowledge/collections/${article.collection_id}`}
                    className="text-brand-purple hover:text-brand-navy"
                  >
                    {article.collection_title}
                  </Link>
                </li>
              </>
            )}
            <li className="text-neutral-400">→</li>
            <li className="text-neutral-700 font-medium truncate">{article.title}</li>
          </ol>
        </nav>

        {/* Article Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between mb-4">
            <h1 className="text-4xl font-bold text-neutral-900 font-heading flex-1">
              {article.title}
            </h1>
            
            {/* Edit Button - Admin Only */}
            {isMainBranch && (
              <Link
                to={`/knowledge/admin/articles/${articleId}/edit`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors text-sm font-medium"
              >
                <PencilSquareIcon className="h-5 w-5" />
                Edit Article
              </Link>
            )}
          </div>
          
          <div className="flex items-center gap-4 text-sm text-neutral-500 mb-4">
            <span className="flex items-center gap-1">
              <ClockIcon className="h-4 w-4" />
              {formatDate(article.created_at)}
            </span>
            
            {article.view_count > 0 && (
              <span className="flex items-center gap-1">
                <EyeIcon className="h-4 w-4" />
                {article.view_count} view{article.view_count !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          
          {article.summary && (
            <p className="text-lg text-neutral-600 leading-relaxed">
              {article.summary}
            </p>
          )}
        </div>

        {/* Video Embed */}
        {renderVideo()}

        {/* Article Content */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-8 mb-6">
          {renderContent(article.content)}
        </div>

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">
              Attachments & Resources
            </h3>
            <div className="space-y-2">
              {attachments.map((attachment) => (
                <a
                  key={attachment.id}
                  href={`/api/knowledge/attachments/${attachment.id}/download`}
                  download
                  className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg border border-neutral-200 hover:border-brand-purple hover:bg-brand-light/30 transition-all"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-900">
                      {attachment.file_name}
                    </p>
                    {attachment.description && (
                      <p className="text-xs text-neutral-500">{attachment.description}</p>
                    )}
                    {attachment.file_size && (
                      <p className="text-xs text-neutral-400 mt-1">
                        {formatFileSize(attachment.file_size)}
                      </p>
                    )}
                  </div>
                  <ArrowDownTrayIcon className="h-5 w-5 text-neutral-600 ml-4 flex-shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Onboarding Checklist */}
        <div className="mb-6">
          <ChecklistDisplay 
            articleId={article.id} 
            isMainBranch={companyName === 'Acme Operations (Main Branch)' || window.location.hostname.includes('localhost')}
          />
        </div>

        {/* Comments */}
        <KnowledgeComments articleId={articleId} />
      </div>
  );
}

