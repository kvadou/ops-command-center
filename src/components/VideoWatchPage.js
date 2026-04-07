import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(sec) {
  if (!sec || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── SVG Icons (inline to avoid external deps) ───────────────────────────────

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M8 5.14v14l11-7-11-7z" />
  </svg>
);

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
  </svg>
);

const VolumeHighIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
  </svg>
);

const VolumeMuteIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <path d="M11 5L6 9H2v6h4l5 4V5z" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

const FullscreenIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
  </svg>
);

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
);

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

const CodeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
    <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
  </svg>
);

const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
);

const LinkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
  </svg>
);

// ── Playback Speed Options ───────────────────────────────────────────────────

const SPEEDS = [0.5, 1, 1.5, 2];

// ── Main Component ───────────────────────────────────────────────────────────

export default function VideoWatchPage() {
  const { token } = useParams();

  // Data state
  const [video, setVideo] = useState(null);
  const [error, setError] = useState(null);
  const [errorType, setErrorType] = useState(null); // 'auth' | 'forbidden' | 'generic'
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Player state
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  // UI state
  const [copied, setCopied] = useState(false);
  const [embedModal, setEmbedModal] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);

  // Refs
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const controlsTimer = useRef(null);
  const seekBarRef = useRef(null);

  // Auth check — user object in localStorage indicates a logged-in session (cookies handle actual auth)
  const isLoggedIn = typeof window !== 'undefined' && !!localStorage.getItem('user');

  // ── Data Fetching ────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`/api/videos/watch/${token}`)
      .then(async (r) => {
        if (r.ok) return r.json();
        const body = await r.json().catch(() => ({}));
        if (r.status === 401 && body.requires_auth) {
          setErrorType('auth');
          throw new Error('Login required');
        }
        if (r.status === 403) {
          setErrorType('forbidden');
          throw new Error('Access denied');
        }
        throw new Error('Video not found');
      })
      .then((data) => {
        setVideo(data);
        // Track view (fire and forget)
        if (data.id) fetch(`/api/videos/${data.id}/view`, { method: 'POST' }).catch(() => {});
      })
      .catch((e) => {
        setError(e.message);
        if (!errorType) setErrorType('generic');
      })
      .finally(() => setLoading(false));
  }, [token]);

  // Fetch comments when video loads
  useEffect(() => {
    if (!video?.id) return;
    fetch(`/api/videos/${video.id}/comments`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setComments(Array.isArray(data) ? data : data.comments || []))
      .catch(() => {});
  }, [video?.id]);

  // ── Video Event Handlers ─────────────────────────────────────────────────

  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    if (v.buffered.length > 0) {
      setBuffered(v.buffered.end(v.buffered.length - 1));
    }
  }, []);

  const onLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (v) setDuration(v.duration);
  }, []);

  const onEnded = useCallback(() => {
    setPlaying(false);
    setHasStarted(false);
  }, []);

  // ── Player Controls ──────────────────────────────────────────────────────

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
      setHasStarted(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }, []);

  const seekTo = useCallback((time) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = time;
    setCurrentTime(time);
  }, []);

  const handleSeekBarClick = useCallback((e) => {
    const bar = seekBarRef.current;
    if (!bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(pct * duration);
  }, [duration, seekTo]);

  const handleVolumeChange = useCallback((e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setMuted(val === 0);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
    }
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const next = !muted;
    setMuted(next);
    v.muted = next;
    if (!next && volume === 0) {
      setVolume(0.5);
      v.volume = 0.5;
    }
  }, [muted, volume]);

  const cycleSpeed = useCallback(() => {
    setShowSpeedMenu((p) => !p);
  }, []);

  const setPlaybackSpeed = useCallback((s) => {
    setSpeed(s);
    setShowSpeedMenu(false);
    if (videoRef.current) videoRef.current.playbackRate = s;
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen?.();
    }
  }, []);

  // ── Keyboard + Mouse Controls ────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      if (e.code === 'ArrowLeft') { e.preventDefault(); seekTo(Math.max(0, currentTime - 5)); }
      if (e.code === 'ArrowRight') { e.preventDefault(); seekTo(Math.min(duration, currentTime + 5)); }
      if (e.code === 'KeyM') { e.preventDefault(); toggleMute(); }
      if (e.code === 'KeyF') { e.preventDefault(); toggleFullscreen(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [togglePlay, seekTo, toggleMute, toggleFullscreen, currentTime, duration]);

  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimer.current);
    if (playing) {
      controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [playing]);

  useEffect(() => {
    if (!playing) setShowControls(true);
    else resetControlsTimer();
    return () => clearTimeout(controlsTimer.current);
  }, [playing, resetControlsTimer]);

  // Close speed menu on click outside
  useEffect(() => {
    if (!showSpeedMenu) return;
    const close = () => setShowSpeedMenu(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showSpeedMenu]);

  // ── Comment Submission ───────────────────────────────────────────────────

  const submitComment = async () => {
    if (!commentText.trim() || !video?.id || !isLoggedIn) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/videos/${video.id}/comments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: commentText.trim(), timestamp_seconds: Math.floor(currentTime) }),
      });
      if (res.ok) {
        const newComment = await res.json();
        setComments((prev) => [...prev, newComment]);
        setCommentText('');
      }
    } catch { /* ignore */ }
    setSubmittingComment(false);
  };

  // ── Share / Embed ────────────────────────────────────────────────────────

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const embedSnippet = `<iframe src="${window.location.href}" width="960" height="540" frameborder="0" allowfullscreen></iframe>`;

  const copyEmbed = () => {
    navigator.clipboard.writeText(embedSnippet);
    setEmbedCopied(true);
    setTimeout(() => setEmbedCopied(false), 2000);
  };

  // ── Render: Loading ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0f17] flex items-center justify-center" style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-[#6A469D] border-t-transparent rounded-full animate-spin" />
          <span className="text-neutral-400 text-sm">Loading video...</span>
        </div>
      </div>
    );
  }

  // ── Render: Error States ─────────────────────────────────────────────────

  if (error) {
    return (
      <div className="min-h-screen bg-[#0f0f17] flex items-center justify-center" style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}>
        <div className="text-center max-w-md px-6">
          {errorType === 'auth' && (
            <>
              <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #6A469D, #2D2F8E)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-8 h-8"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
              </div>
              <h1 className="text-white text-xl font-semibold mb-2">Sign in required</h1>
              <p className="text-neutral-400 text-sm mb-6">This video requires authentication to view.</p>
              <a href="/login" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-medium transition-all hover:opacity-90" style={{ background: 'linear-gradient(135deg, #6A469D, #2D2F8E)' }}>
                Sign in to view
              </a>
            </>
          )}
          {errorType === 'forbidden' && (
            <>
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 mx-auto mb-5 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" className="w-8 h-8"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
              </div>
              <h1 className="text-white text-xl font-semibold mb-2">Access denied</h1>
              <p className="text-neutral-400 text-sm">You don't have access to this video.</p>
            </>
          )}
          {errorType === 'generic' && (
            <>
              <div className="w-16 h-16 rounded-2xl bg-neutral-800 mx-auto mb-5 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="#737373" strokeWidth="2" className="w-8 h-8"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
              </div>
              <h1 className="text-white text-xl font-semibold mb-2">Video not found</h1>
              <p className="text-neutral-400 text-sm">This link may have expired or the video was removed.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Derived Values ───────────────────────────────────────────────────────

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const commentTimestamps = comments.filter((c) => c.timestamp_seconds != null).map((c) => c.timestamp_seconds);
  const sortedComments = [...comments].sort((a, b) => (a.timestamp_seconds ?? 0) - (b.timestamp_seconds ?? 0));

  // ── Render: Watch Page ───────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50" style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}>

      {/* ── Header Bar ──────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-neutral-200 px-4 sm:px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm" style={{ background: 'linear-gradient(135deg, #6A469D, #2D2F8E)' }}>
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M8 5.14v14l11-7-11-7z" /></svg>
          </div>
          <span className="font-semibold text-neutral-900 text-sm tracking-tight">STC Capture</span>
        </div>
        <button
          onClick={copyLink}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
          style={copied ? { background: '#f0fdf4', borderColor: '#bbf7d0', color: '#16a34a' } : { borderColor: '#e5e7eb', color: '#525252' }}
        >
          {copied ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5"><polyline points="20 6 9 17 4 12" /></svg>
              Copied!
            </>
          ) : (
            <>
              <LinkIcon />
              Copy Link
            </>
          )}
        </button>
      </header>

      {/* ── Video Player Area ───────────────────────────────────────────── */}
      <div className="bg-[#0f0f17] flex-shrink-0">
        <div className="max-w-[960px] mx-auto">
          <div
            ref={containerRef}
            className="relative w-full cursor-pointer select-none group"
            style={{ paddingBottom: '56.25%' /* 16:9 */ }}
            onMouseMove={resetControlsTimer}
            onMouseLeave={() => playing && setShowControls(false)}
            onClick={(e) => {
              // Don't toggle play if clicking on controls bar
              if (e.target.closest('[data-controls]')) return;
              togglePlay();
            }}
          >
            <video
              ref={videoRef}
              src={video.video_url}
              className="absolute inset-0 w-full h-full object-contain bg-black"
              onTimeUpdate={onTimeUpdate}
              onLoadedMetadata={onLoadedMetadata}
              onEnded={onEnded}
              onPlay={() => { setPlaying(true); setHasStarted(true); }}
              onPause={() => setPlaying(false)}
              playsInline
              preload="metadata"
            />

            {/* Big centered play button (when not started or paused) */}
            {!playing && (
              <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white shadow-xl transition-transform hover:scale-105">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 ml-1">
                    <PlayIcon />
                  </div>
                </div>
              </div>
            )}

            {/* Controls overlay */}
            <div
              data-controls
              className="absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-300"
              style={{ opacity: showControls ? 1 : 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.85))' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Seek bar */}
              <div
                ref={seekBarRef}
                className="relative h-6 flex items-end px-3 cursor-pointer group/seek"
                onClick={handleSeekBarClick}
              >
                <div className="w-full h-1 group-hover/seek:h-1.5 rounded-full bg-white/20 relative transition-all">
                  {/* Buffered */}
                  <div className="absolute inset-y-0 left-0 rounded-full bg-white/20" style={{ width: `${bufferedPct}%` }} />
                  {/* Progress */}
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${progress}%`, background: '#6A469D' }} />
                  {/* Comment dots */}
                  {commentTimestamps.map((ts, i) => (
                    <div
                      key={i}
                      className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-yellow-400 border border-yellow-500 shadow-sm"
                      style={{ left: `${duration > 0 ? (ts / duration) * 100 : 0}%`, transform: 'translate(-50%, -50%)' }}
                      title={formatDuration(ts)}
                    />
                  ))}
                  {/* Thumb */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow opacity-0 group-hover/seek:opacity-100 transition-opacity"
                    style={{ left: `${progress}%`, transform: 'translate(-50%, -50%)' }}
                  />
                </div>
              </div>

              {/* Bottom controls row */}
              <div className="flex items-center gap-2 sm:gap-3 px-3 pb-3 pt-1">
                {/* Play/Pause */}
                <button onClick={togglePlay} className="text-white hover:text-[#6A469D] transition-colors p-1">
                  <div className="w-5 h-5">{playing ? <PauseIcon /> : <PlayIcon />}</div>
                </button>

                {/* Volume */}
                <div className="flex items-center gap-1 group/vol">
                  <button onClick={toggleMute} className="text-white hover:text-[#6A469D] transition-colors p-1">
                    {muted || volume === 0 ? <VolumeMuteIcon /> : <VolumeHighIcon />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={muted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-0 group-hover/vol:w-16 transition-all duration-200 accent-[#6A469D] h-1 cursor-pointer opacity-0 group-hover/vol:opacity-100"
                  />
                </div>

                {/* Time */}
                <span className="text-white/80 text-xs tabular-nums ml-1">
                  {formatDuration(currentTime)} <span className="text-white/40">/</span> {formatDuration(duration)}
                </span>

                <div className="flex-1" />

                {/* Speed */}
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); cycleSpeed(); }}
                    className="text-white/80 hover:text-white text-xs font-medium px-2 py-1 rounded hover:bg-white/10 transition-all"
                  >
                    {speed}x
                  </button>
                  {showSpeedMenu && (
                    <div className="absolute bottom-full right-0 mb-1 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl overflow-hidden min-w-[80px]" onClick={(e) => e.stopPropagation()}>
                      {SPEEDS.map((s) => (
                        <button
                          key={s}
                          onClick={() => setPlaybackSpeed(s)}
                          className={`block w-full text-left px-3 py-1.5 text-xs transition-colors ${s === speed ? 'text-[#6A469D] bg-white/5 font-medium' : 'text-white/80 hover:bg-white/10'}`}
                        >
                          {s}x
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Fullscreen */}
                <button onClick={toggleFullscreen} className="text-white/80 hover:text-white transition-colors p-1">
                  <FullscreenIcon />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Metadata Section ────────────────────────────────────────────── */}
      <div className="bg-white border-b border-neutral-200">
        <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-5">
          <h1 className="text-lg sm:text-xl font-semibold text-neutral-900 leading-tight mb-2">
            {video.title || 'Screen Recording'}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-500 mb-4">
            {video.recorded_by_name && (
              <span className="flex items-center gap-1.5">
                {video.recorded_by_avatar ? (
                  <img src={video.recorded_by_avatar} alt="" className="w-5 h-5 rounded-full object-cover" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-[#6A469D] flex items-center justify-center text-white text-[10px] font-medium">
                    {video.recorded_by_name.charAt(0).toUpperCase()}
                  </div>
                )}
                {video.recorded_by_name}
              </span>
            )}
            {video.created_at && (
              <>
                <span className="text-neutral-300">·</span>
                <span>{formatDate(video.created_at)}</span>
              </>
            )}
            {(video.duration_seconds || duration > 0) && (
              <>
                <span className="text-neutral-300">·</span>
                <span>{formatDuration(video.duration_seconds || duration)}</span>
              </>
            )}
            {video.view_count != null && (
              <>
                <span className="text-neutral-300">·</span>
                <span className="flex items-center gap-1">
                  <EyeIcon />
                  {video.view_count.toLocaleString()} {video.view_count === 1 ? 'view' : 'views'}
                </span>
              </>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={video.video_url}
              download={video.title || 'video'}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 transition-colors"
            >
              <DownloadIcon /> Download
            </a>
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
              style={copied ? { background: '#f0fdf4', color: '#16a34a' } : { background: '#f5f5f5', color: '#404040' }}
            >
              <ShareIcon /> {copied ? 'Copied!' : 'Share'}
            </button>
            <button
              onClick={() => setEmbedModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 transition-colors"
            >
              <CodeIcon /> Embed
            </button>
          </div>
        </div>
      </div>

      {/* ── Timestamped Comments ─────────────────────────────────────────── */}
      <div className="bg-white flex-1">
        <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-5">
          <h2 className="text-sm font-semibold text-neutral-900 mb-4">
            Comments {comments.length > 0 && <span className="text-neutral-400 font-normal">({comments.length})</span>}
          </h2>

          {/* Comment list */}
          {sortedComments.length > 0 ? (
            <div className="space-y-3 mb-5">
              {sortedComments.map((c, i) => (
                <div key={c.id || i} className="flex gap-3 group">
                  {c.timestamp_seconds != null && (
                    <button
                      onClick={() => seekTo(c.timestamp_seconds)}
                      className="flex-shrink-0 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-[#6A469D]/10 text-[#6A469D] hover:bg-[#6A469D]/20 transition-colors mt-0.5 tabular-nums"
                    >
                      {formatDuration(c.timestamp_seconds)}
                    </button>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-xs font-medium text-neutral-900">{c.author_name || 'Anonymous'}</span>
                      <span className="text-[11px] text-neutral-400">{formatRelativeDate(c.created_at)}</span>
                    </div>
                    <p className="text-sm text-neutral-700 leading-relaxed">{c.text}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-400 mb-5">No comments yet. Be the first to comment.</p>
          )}

          {/* Add comment */}
          {isLoggedIn ? (
            <div className="border-t border-neutral-100 pt-4">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 px-2 py-0.5 rounded text-[11px] font-mono text-neutral-400 bg-neutral-100 mt-1 tabular-nums">
                  {formatDuration(currentTime)}
                </span>
                <div className="flex-1 flex gap-2">
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submitComment()}
                    placeholder="Add a comment at this timestamp..."
                    className="flex-1 px-3 py-2 rounded-lg border border-neutral-200 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#6A469D]/30 focus:border-[#6A469D] transition-all"
                  />
                  <button
                    onClick={submitComment}
                    disabled={!commentText.trim() || submittingComment}
                    className="px-4 py-2 rounded-lg text-xs font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
                    style={{ background: '#6A469D' }}
                  >
                    {submittingComment ? 'Posting...' : 'Post'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="border-t border-neutral-100 pt-4 text-center">
              <a href="/login" className="text-sm font-medium text-[#6A469D] hover:text-[#2D2F8E] transition-colors">
                Sign in to comment
              </a>
            </div>
          )}
        </div>
      </div>

      {/* ── Embed Modal ─────────────────────────────────────────────────── */}
      {embedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setEmbedModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-neutral-900">Embed Code</h3>
              <button onClick={() => setEmbedModal(false)} className="text-neutral-400 hover:text-neutral-600 transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <pre className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-xs text-neutral-700 overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed">
              {embedSnippet}
            </pre>
            <button
              onClick={copyEmbed}
              className="mt-4 w-full py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
              style={{ background: embedCopied ? '#16a34a' : '#6A469D' }}
            >
              {embedCopied ? 'Copied to clipboard!' : 'Copy embed code'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
