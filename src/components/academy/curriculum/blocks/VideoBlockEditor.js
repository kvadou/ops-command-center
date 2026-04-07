import React from 'react';

export default function VideoBlockEditor({ block, onChange }) {
  // Extract video ID for preview
  const getEmbedUrl = (url) => {
    if (!url) return null;

    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;

    // Vimeo
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;

    return null;
  };

  const embedUrl = getEmbedUrl(block.url);

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={block.title || ''}
        onChange={(e) => onChange({ ...block, title: e.target.value })}
        placeholder="Video title"
        className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
      />
      <input
        type="url"
        value={block.url || ''}
        onChange={(e) => onChange({ ...block, url: e.target.value })}
        placeholder="YouTube or Vimeo URL"
        className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
      />
      <textarea
        value={block.description || ''}
        onChange={(e) => onChange({ ...block, description: e.target.value })}
        placeholder="Description (optional)"
        rows={2}
        className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple resize-none"
      />
      {embedUrl ? (
        <div className="aspect-video rounded-lg overflow-hidden bg-black">
          <iframe
            src={embedUrl}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={block.title || 'Video preview'}
          />
        </div>
      ) : block.url ? (
        <div className="aspect-video bg-neutral-100 rounded-lg flex items-center justify-center">
          <span className="text-neutral-500 text-sm">Invalid video URL - use YouTube or Vimeo</span>
        </div>
      ) : null}
    </div>
  );
}
