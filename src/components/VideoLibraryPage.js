import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  VideoCameraIcon,
  MagnifyingGlassIcon,
  EllipsisVerticalIcon,
  ClipboardDocumentIcon,
  TrashIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'operations', label: 'Operations' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'hr-staffing', label: 'HR & Staffing' },
  { value: 'finance', label: 'Finance' },
  { value: 'technology', label: 'Technology' },
];

const CATEGORY_COLORS = {
  operations: 'bg-brand-cyan/10 text-brand-cyan',
  marketing: 'bg-brand-pink/10 text-brand-pink',
  'hr-staffing': 'bg-brand-green/10 text-brand-green',
  finance: 'bg-brand-yellow/10 text-brand-yellow',
  technology: 'bg-brand-purple/10 text-brand-purple',
};

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getCategoryLabel(value) {
  const cat = CATEGORIES.find((c) => c.value === value);
  return cat ? cat.label : value;
}

export default function VideoLibraryPage() {
  const navigate = useNavigate();
  const [videos, setVideos] = useState([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState('');
  const [myVideos, setMyVideos] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const debounceRef = useRef(null);

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, myVideos]);

  const fetchVideos = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '12',
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (category) params.set('category', category);
      if (myVideos) params.set('mine', 'true');

      const res = await axios.get(`/api/videos/library?${params.toString()}`, {
        withCredentials: true,
      });

      if (page === 1) {
        setVideos(res.data.videos || []);
      } else {
        setVideos((prev) => [...prev, ...(res.data.videos || [])]);
      }
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error('Error fetching videos:', err);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, category, myVideos]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const handleCopyLink = async (e, video) => {
    e.stopPropagation();
    const url = `${window.location.origin}/videos/watch/${video.shareable_token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(video.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDelete = async (video) => {
    try {
      setDeleting(true);
      await axios.delete(`/api/videos/${video.id}`, {
        withCredentials: true,
      });
      setVideos((prev) => prev.filter((v) => v.id !== video.id));
      setTotal((prev) => prev - 1);
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Error deleting video:', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleLoadMore = () => {
    setPage((prev) => prev + 1);
  };

  const hasMore = videos.length < total;

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Video Library</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Screen recordings and video content from your team
          </p>
        </div>
        <div className="relative group">
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white text-sm font-medium rounded-lg hover:bg-brand-navy transition-colors">
            <VideoCameraIcon className="h-4 w-4" />
            Record
          </button>
          <div className="absolute right-0 top-full mt-2 w-64 bg-neutral-800 text-white text-xs rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
            Use the STC Capture extension to record
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search videos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-neutral-200 rounded-lg pl-9 pr-4 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-white border border-neutral-200 rounded-lg px-4 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>
        <div className="inline-flex rounded-lg border border-neutral-200 overflow-hidden">
          <button
            onClick={() => setMyVideos(false)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              !myVideos
                ? 'bg-brand-purple text-white'
                : 'bg-white text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            All Videos
          </button>
          <button
            onClick={() => setMyVideos(true)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              myVideos
                ? 'bg-brand-purple text-white'
                : 'bg-white text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            My Videos
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && page === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden animate-pulse"
            >
              <div className="aspect-video bg-neutral-100" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-neutral-100 rounded w-3/4" />
                <div className="h-3 bg-neutral-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && videos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
            <VideoCameraIcon className="h-8 w-8 text-neutral-400" />
          </div>
          <h2 className="text-lg font-semibold text-neutral-900 mb-1">No videos yet</h2>
          <p className="text-sm text-neutral-500">
            Use the STC Capture extension to record your first video
          </p>
        </div>
      )}

      {/* Video grid */}
      {!(loading && page === 1) && videos.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {videos.map((video) => (
              <div
                key={video.id}
                onClick={() => navigate(`/videos/watch/${video.shareable_token}`)}
                className="group bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden hover:shadow-md transition-all duration-200 cursor-pointer relative"
              >
                {/* Thumbnail */}
                <div className="relative aspect-video bg-neutral-100">
                  {video.thumbnail_url ? (
                    <img
                      src={video.thumbnail_url}
                      alt={video.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <VideoCameraIcon className="h-10 w-10 text-neutral-300" />
                    </div>
                  )}
                  {video.duration_seconds != null && (
                    <span className="absolute bottom-2 right-2 bg-neutral-900/80 text-white text-xs font-medium px-1.5 py-0.5 rounded">
                      {formatDuration(video.duration_seconds)}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="text-sm font-medium text-neutral-900 line-clamp-2 leading-snug mb-1">
                    {video.title || 'Untitled Video'}
                  </h3>
                  <p className="text-xs text-neutral-500 mb-2">
                    Recorded by {video.recorded_by || 'Unknown'}{' '}
                    <span className="text-neutral-300 mx-1">&middot;</span>
                    {formatRelativeDate(video.created_at)}
                  </p>
                  {video.category && (
                    <span
                      className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        CATEGORY_COLORS[video.category] || 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      {getCategoryLabel(video.category)}
                    </span>
                  )}
                </div>

                {/* Kebab menu */}
                <div
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Menu as="div" className="relative">
                    <MenuButton className="p-1.5 rounded-lg bg-white/90 hover:bg-white shadow-sm border border-neutral-200 text-neutral-500 hover:text-neutral-700 transition-colors">
                      <EllipsisVerticalIcon className="h-4 w-4" />
                    </MenuButton>
                    <MenuItems className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-20">
                      <MenuItem>
                        {({ active }) => (
                          <button
                            onClick={(e) => handleCopyLink(e, video)}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${
                              active ? 'bg-neutral-50' : ''
                            } text-neutral-700`}
                          >
                            <ClipboardDocumentIcon className="h-4 w-4" />
                            {copiedId === video.id ? 'Copied!' : 'Copy Link'}
                          </button>
                        )}
                      </MenuItem>
                      <MenuItem>
                        {({ active }) => (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm(video);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${
                              active ? 'bg-red-50' : ''
                            } text-red-600`}
                          >
                            <TrashIcon className="h-4 w-4" />
                            Delete
                          </button>
                        )}
                      </MenuItem>
                    </MenuItems>
                  </Menu>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="mt-8 flex flex-col items-center gap-3">
            <p className="text-sm text-neutral-500">
              Showing {videos.length} of {total} videos
            </p>
            {hasMore && (
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="px-6 py-2 bg-white border border-neutral-200 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 transition-colors disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Load more'}
              </button>
            )}
          </div>
        </>
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-neutral-900">Delete video?</h3>
                <p className="text-sm text-neutral-500 mt-0.5">
                  This will permanently delete &ldquo;{deleteConfirm.title || 'Untitled Video'}&rdquo;.
                  This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
