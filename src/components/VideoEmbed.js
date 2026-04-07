import { useState, useEffect } from 'react';

function formatDuration(seconds) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export default function VideoEmbed({ token }) {
  const [video, setVideo] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError('no-token');
      setLoading(false);
      return;
    }

    fetch(`/api/videos/watch/${token}`)
      .then((r) => {
        if (r.status === 401) throw new Error('auth');
        if (!r.ok) throw new Error('not-found');
        return r.json();
      })
      .then(setVideo)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
        <div className="bg-neutral-50 px-4 py-2 border-b border-neutral-100">
          <div className="h-4 w-48 bg-neutral-200 rounded animate-pulse" />
        </div>
        <div className="w-full bg-neutral-200 animate-pulse" style={{ height: 200 }} />
        <div className="px-4 py-2">
          <div className="h-3 w-32 bg-neutral-100 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  // Auth required
  if (error === 'auth') {
    return (
      <div className="bg-neutral-50 rounded-xl border border-neutral-200 px-6 py-8 text-center">
        <p className="text-sm text-neutral-500">Sign in to view this video</p>
      </div>
    );
  }

  // Not found / error
  if (error || !video) {
    return (
      <div className="bg-neutral-50 rounded-xl border border-neutral-200 px-6 py-8 text-center">
        <p className="text-sm text-neutral-400">Video unavailable</p>
      </div>
    );
  }

  const duration = formatDuration(video.duration_seconds);
  const title = video.title || 'Screen Recording';
  const watchUrl = `/videos/watch/${token}`;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
      {/* Title bar */}
      <div className="bg-neutral-50 px-4 py-2 border-b border-neutral-100 flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-800 truncate">{title}</span>
        {duration && (
          <span className="ml-2 shrink-0 text-xs font-medium text-neutral-500 bg-neutral-200 rounded-full px-2 py-0.5">
            {duration}
          </span>
        )}
      </div>

      {/* Video player */}
      <video
        src={video.video_url}
        controls
        preload="metadata"
        className="w-full bg-black"
        style={{ maxHeight: 320 }}
      />

      {/* Watch full link */}
      <div className="px-4 py-2 border-t border-neutral-100">
        <a
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-brand-purple hover:text-brand-navy transition-colors"
        >
          Watch full video →
        </a>
      </div>
    </div>
  );
}
