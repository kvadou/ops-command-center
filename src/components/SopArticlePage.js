import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ClockIcon,
  EyeIcon,
  ExclamationCircleIcon,
  UserIcon,
  PencilSquareIcon,
  PlayIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

export default function SopArticlePage() {
  const { sopId } = useParams();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSop();
  }, [sopId]);

  const fetchSop = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/knowledge/articles/${sopId}`);
      const data = await response.json();
      setArticle(data.article);
    } catch (error) {
      console.error('Error fetching SOP:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderContent = (content) => {
    if (!content) return null;
    let json = content;
    if (typeof content === 'string') {
      try { json = JSON.parse(content); } catch (e) {
        return <p className="text-sm text-neutral-700 leading-relaxed">{content}</p>;
      }
    }

    const renderTextWithMarks = (node) => {
      if (!node.text) return null;
      let text = node.text;
      if (node.marks) {
        node.marks.forEach((mark) => {
          if (mark.type === 'bold') text = <strong className="font-semibold">{text}</strong>;
          if (mark.type === 'italic') text = <em>{text}</em>;
          if (mark.type === 'code') text = <code className="bg-neutral-100 px-1 py-0.5 rounded text-sm font-mono">{text}</code>;
          if (mark.type === 'link') {
            text = (
              <a href={mark.attrs?.href} target="_blank" rel="noopener noreferrer"
                className="text-brand-purple hover:text-brand-navy font-medium underline transition-colors">{text}</a>
            );
          }
        });
      }
      return text;
    };

    const renderListItemContent = (nodes) => {
      if (!nodes) return null;
      return nodes.map((node, i) => {
        if (node.type === 'paragraph') {
          return <span key={i}>{node.content?.map((child, j) => <span key={j}>{renderTextWithMarks(child)}</span>)}</span>;
        }
        if (node.text) return <span key={i}>{renderTextWithMarks(node)}</span>;
        return null;
      });
    };

    const renderNode = (node, key) => {
      if (!node) return null;
      if (node.type === 'doc') return node.content?.map((child, i) => renderNode(child, i));
      if (node.type === 'paragraph') {
        return (
          <p key={key} className="mb-4 text-sm text-neutral-700 leading-relaxed">
            {node.content?.map((child, i) => <span key={i}>{renderTextWithMarks(child)}</span>)}
          </p>
        );
      }
      if (node.type === 'heading') {
        const level = node.attrs?.level || 2;
        const Tag = `h${level}`;
        const classes = {
          1: 'text-2xl font-semibold text-neutral-900 mb-4 mt-8',
          2: 'text-xl font-semibold text-neutral-900 mb-3 mt-6',
          3: 'text-lg font-semibold text-neutral-900 mb-2 mt-4',
        };
        return (
          <Tag key={key} className={classes[level] || classes[2]}>
            {node.content?.map((child, i) => <span key={i}>{renderTextWithMarks(child)}</span>)}
          </Tag>
        );
      }
      if (node.type === 'bulletList') {
        return <ul key={key} className="list-disc pl-6 mb-4 space-y-2">{node.content?.map((child, i) => renderNode(child, i))}</ul>;
      }
      if (node.type === 'orderedList') {
        return <ol key={key} className="list-decimal pl-6 mb-4 space-y-2">{node.content?.map((child, i) => renderNode(child, i))}</ol>;
      }
      if (node.type === 'listItem') {
        return <li key={key} className="text-sm text-neutral-700 leading-relaxed">{renderListItemContent(node.content)}</li>;
      }
      if (node.type === 'blockquote') {
        return (
          <blockquote key={key} className="border-l-4 border-brand-purple pl-4 italic text-sm text-neutral-700 mb-4 bg-brand-purple/5 py-2 pr-4 rounded-r-lg">
            {node.content?.map((child, i) => renderNode(child, i))}
          </blockquote>
        );
      }
      if (node.type === 'codeBlock') {
        return (
          <pre key={key} className="bg-neutral-900 text-neutral-100 p-4 rounded-lg mb-4 overflow-x-auto text-sm">
            <code>{node.content?.map((child) => child.text).join('') || ''}</code>
          </pre>
        );
      }
      if (node.type === 'image') {
        return <img key={key} src={node.attrs?.src} alt={node.attrs?.alt || ''} className="max-w-full h-auto rounded-lg mb-4" />;
      }
      if (node.type === 'hardBreak') return <br key={key} />;
      if (node.text) return <span key={key}>{renderTextWithMarks(node)}</span>;
      return null;
    };

    return (
      <div className="prose max-w-none">
        {json.content?.map((node, i) => renderNode(node, i))}
      </div>
    );
  };

  const renderStructuredContent = () => {
    let content = article.content;
    if (typeof content === 'string') {
      try { content = JSON.parse(content); } catch { content = null; }
    }
    if (!content) return null;

    // Legacy flat TipTap format — single card
    if (content.type === 'doc') {
      return (
        <div className="bg-white rounded-xl border border-neutral-200 p-6 mb-6">
          {renderContent(content)}
        </div>
      );
    }

    // Structured format
    const sections = [
      { key: 'overview', label: 'Overview' },
      { key: 'prerequisites', label: 'Prerequisites' },
      { key: 'steps', label: 'Steps' },
      { key: 'notes', label: 'Notes & Tips' },
    ];

    return (
      <div className="space-y-4 mb-6">
        {sections.map(({ key, label }) => {
          const sectionContent = content[key];
          if (!sectionContent || !sectionContent.content?.length) return null;
          return (
            <div key={key} className="bg-white rounded-xl border border-neutral-200 p-6">
              <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-4">{label}</h2>
              {renderContent(sectionContent)}
            </div>
          );
        })}
        {content.related_links?.length > 0 && (
          <div className="bg-white rounded-xl border border-neutral-200 p-6">
            <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-4">Related Links</h2>
            <ul className="space-y-2">
              {content.related_links.map((link, i) => (
                <li key={i}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-brand-purple hover:text-brand-navy font-medium transition-colors"
                  >
                    {link.label || link.url} →
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderVideo = () => {
    if (!article?.video_url) return null;
    const videoUrl = article.video_url;
    const provider = article.video_provider;

    if (provider === 'loom' || videoUrl.includes('loom.com')) {
      const match = videoUrl.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
      if (match) {
        return (
          <div className="mb-6 relative w-full rounded-xl overflow-hidden" style={{ paddingBottom: '56.25%' }}>
            <iframe src={`https://www.loom.com/embed/${match[1]}`} allowFullScreen
              className="absolute top-0 left-0 w-full h-full" title="Loom video" />
          </div>
        );
      }
    }
    if (provider === 'youtube' || videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
      const match = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
      if (match) {
        return (
          <div className="mb-6 relative w-full rounded-xl overflow-hidden" style={{ paddingBottom: '56.25%' }}>
            <iframe src={`https://www.youtube.com/embed/${match[1]}`} allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              className="absolute top-0 left-0 w-full h-full" title="YouTube video" />
          </div>
        );
      }
    }
    return (
      <div className="mb-6 bg-neutral-50 rounded-xl border border-neutral-200 p-6 text-center">
        <PlayIcon className="mx-auto h-10 w-10 text-neutral-400 mb-2" />
        <a href={videoUrl} target="_blank" rel="noopener noreferrer"
          className="text-brand-purple hover:text-brand-navy font-medium text-sm transition-colors">
          Watch Video →
        </a>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-6">
        <div className="animate-pulse space-y-6">
          <div className="h-4 bg-neutral-200 rounded w-1/4" />
          <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-4">
            <div className="h-6 bg-neutral-200 rounded w-3/4" />
            <div className="h-4 bg-neutral-200 rounded w-full" />
            <div className="h-4 bg-neutral-200 rounded w-1/2" />
          </div>
          <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-3">
            <div className="h-4 bg-neutral-200 rounded w-full" />
            <div className="h-4 bg-neutral-200 rounded w-5/6" />
            <div className="h-4 bg-neutral-200 rounded w-4/6" />
            <div className="h-4 bg-neutral-200 rounded w-full" />
            <div className="h-4 bg-neutral-200 rounded w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-6">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <DocumentTextIcon className="h-12 w-12 text-neutral-300 mb-4" />
          <h3 className="text-lg font-semibold text-neutral-600 mb-2">SOP not found</h3>
          <p className="text-sm text-neutral-400 mb-6 max-w-sm">
            This SOP may have been removed or the link may be incorrect.
          </p>
          <Link
            to="/sop"
            className="inline-flex items-center gap-2 bg-brand-purple text-white hover:bg-brand-purple/90 rounded-[10px] px-4 py-2 text-sm font-medium transition-all duration-200 shadow-sm"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to SOP Library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-neutral-500 mb-6">
        <Link to="/sop" className="flex items-center gap-1 hover:text-brand-purple font-medium transition-colors">
          <ArrowLeftIcon className="h-4 w-4" />
          SOP Library
        </Link>
        {article.collection_title && (
          <>
            <span className="text-neutral-300">/</span>
            <span className="text-neutral-500">{article.collection_title}</span>
          </>
        )}
      </div>

      {/* Title + Metadata */}
      <div className="bg-white rounded-xl border border-neutral-200 p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <h1 className="text-2xl font-semibold text-neutral-900 flex-1">
            {article.title}
          </h1>
          <div className="flex items-center gap-2 flex-shrink-0">
            {article.sop_required && (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#FCE8F0] text-[#DA2E72] rounded-full text-xs font-medium">
                <ExclamationCircleIcon className="h-4 w-4" />
                Required
              </span>
            )}
            {!article.sop_required && (
              <span className="px-3 py-1 bg-neutral-100 text-neutral-500 rounded-full text-xs font-medium">
                Optional
              </span>
            )}
            {article.sop_version && (
              <span className="px-3 py-1 bg-brand-purple/10 text-brand-purple rounded-full text-xs font-medium">
                v{article.sop_version}
              </span>
            )}
          </div>
        </div>

        {article.summary && (
          <p className="text-sm text-neutral-600 mb-4 leading-relaxed">{article.summary}</p>
        )}

        <div className="flex flex-wrap gap-4 text-sm text-neutral-500 pt-4 border-t border-neutral-100">
          {article.sop_owner && (
            <span className="flex items-center gap-1.5">
              <UserIcon className="h-4 w-4 text-neutral-400" />
              Owner: <span className="font-medium text-neutral-700">{article.sop_owner}</span>
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <ClockIcon className="h-4 w-4 text-neutral-400" />
            Updated {formatDate(article.updated_at)}
          </span>
          {article.view_count > 0 && (
            <span className="flex items-center gap-1.5 tabular-nums">
              <EyeIcon className="h-4 w-4 text-neutral-400" />
              {article.view_count} views
            </span>
          )}
          <Link
            to={`/sop/${article.id}/edit`}
            className="flex items-center gap-1.5 text-brand-purple hover:text-brand-navy font-medium ml-auto transition-colors"
          >
            <PencilSquareIcon className="h-4 w-4" />
            Edit SOP
          </Link>
        </div>
      </div>

      {/* Video (if present) */}
      {article.video_url && (
        <div className="mb-6">{renderVideo()}</div>
      )}

      {/* Content — structured or legacy */}
      {renderStructuredContent()}

      {/* Tags */}
      {article.tags && article.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {article.tags.map((tag) => (
            <span key={tag} className="px-3 py-1 bg-neutral-100 text-neutral-600 rounded-full text-xs font-medium">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Back link */}
      <div className="mt-8 pt-6 border-t border-neutral-200">
        <Link to="/sop" className="inline-flex items-center gap-2 text-brand-purple hover:text-brand-navy text-sm font-medium transition-colors">
          <ArrowLeftIcon className="h-4 w-4" />
          Back to SOP Library
        </Link>
      </div>
    </div>
  );
}
