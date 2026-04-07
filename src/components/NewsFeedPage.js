import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { RoleProvider, useRole } from '../contexts/RoleContext';
import { BranchProvider, useBranch } from '../contexts/BranchContext';
import PostComposer from './news-feed/PostComposer';
import PostCard from './news-feed/PostCard';
import EditPostModal from './EditPostModal';
import { NewspaperIcon, FunnelIcon, SparklesIcon, ClockIcon } from '@heroicons/react/24/outline';
import ConfirmationModal from './ConfirmationModal';
import { useToast } from '../hooks/useToast';

function NewsFeedPageContent() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [postToDelete, setPostToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [activeTab, setActiveTab] = useState('internal');
  const [sortBy, setSortBy] = useState('recent'); // 'recent' or 'top'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportPostId, setReportPostId] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const { currentRole } = useRole();
  const { currentBranch } = useBranch();
  const toast = useToast();

  const observer = useRef();

  // Fetch logic for infinite scroll
  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPosts(nextPage, true);
  };

  const lastPostElementRef = useCallback(node => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        handleLoadMore();
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, hasMore, page]); // Added page to dependencies just in case, though usually handling function is stable if using state updater

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    setPage(1);
    setPosts([]);
    fetchPosts(1, false);
  }, [currentRole, currentBranch, activeTab, sortBy]);

  const fetchCurrentUser = async () => {
    try {
      const response = await fetch('/api/me', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setCurrentUser(data.user || data);
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
    }
  };

  const fetchPosts = async (pageNum = 1, append = false) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: '20',
        role: currentRole || 'admin',
        branch_id: currentBranch || 'main',
        visibility: activeTab,
        sort: sortBy
      });

      const response = await fetch(`/api/news-feed/posts?${params}`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        if (append) {
          setPosts(prev => [...prev, ...data.posts]);
        } else {
          setPosts(data.posts || []);
        }
        setHasMore(data.pagination.page < data.pagination.pages);
      }
    } catch (error) {
      console.error('Error fetching news feed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePost = async (postData) => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/news-feed/posts', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(postData),
      });

      if (response.ok) {
        const data = await response.json();
        setPosts(prev => [data.post, ...prev]);
        setShowComposer(false);
      } else {
        const errorData = await response.json();
        console.error('Error creating post:', errorData);
      }
    } catch (error) {
      console.error('Error creating post:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (postId) => {
    setPostToDelete(postId);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!postToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/news-feed/posts/${postToDelete}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        setPosts(prev => prev.filter(p => p.id !== postToDelete));
        setDeleteModalOpen(false);
        setPostToDelete(null);
      }
    } catch (error) {
      console.error('Error deleting post:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePinPost = async (postId, shouldPin) => {
    try {
      const response = await fetch(`/api/news-feed/posts/${postId}/pin`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_pinned: shouldPin }),
      });

      if (response.ok) {
        setPosts(prev => prev.map(p =>
          p.id === postId ? { ...p, is_pinned: shouldPin } : p
        ));
      }
    } catch (error) {
      console.error('Error pinning post:', error);
    }
  };

  const handleReportPost = (postId) => {
    setReportPostId(postId);
    setReportReason('');
    setReportModalOpen(true);
  };

  const submitReport = async () => {
    if (!reportReason.trim()) return;

    try {
      const response = await fetch(`/api/news-feed/posts/${reportPostId}/report`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: reportReason }),
      });

      if (response.ok) {
        toast.success('Thank you for your report. Our team will review it.');
      }
    } catch (error) {
      console.error('Error reporting post:', error);
    } finally {
      setReportModalOpen(false);
      setReportPostId(null);
    }
  };

  const handleReactionUpdate = useCallback((postId, updatedReactions) => {
    // PostReactions component handles local state, no need to refetch entire feed
    // Only update the post's reaction count in our local state if needed
    if (postId && updatedReactions) {
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, ...updatedReactions } : p
      ));
    }
    // Don't refetch the entire feed - this causes caching issues
  }, []);

  const handleCommentUpdate = useCallback((postId, newCount) => {
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, comment_count: newCount } : p
    ));
  }, []);

  // Separate pinned posts
  const pinnedPosts = posts.filter(p => p.is_pinned);
  const regularPosts = posts.filter(p => !p.is_pinned);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Page Header - White Background Container */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-6 mb-4 sm:mb-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-purple rounded-lg">
              <NewspaperIcon className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-neutral-900">Company News Feed</h1>
              <p className="text-sm text-neutral-600 mt-1">Stay updated with company news and updates</p>
            </div>
          </div>
          <button
            onClick={() => setShowComposer(!showComposer)}
            className="px-4 py-2.5 sm:py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors font-medium text-sm sm:text-base flex items-center justify-center gap-2 min-h-[44px] sm:min-h-0"
          >
            <SparklesIcon className="h-5 w-5 flex-shrink-0" />
            <span className="whitespace-nowrap">{showComposer ? 'Close' : '+ Create Post'}</span>
          </button>
        </div>

        {/* Tabs and Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 border-t border-neutral-200 pt-4">
          {/* Visibility Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 sm:mx-0 px-4 sm:px-0">
            {[
              { key: 'internal', label: 'Internal' },
              { key: 'tutors', label: 'Tutors' },
              { key: 'franchisees', label: 'Franchisees' },
              { key: 'public', label: 'Public' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap min-h-[44px] sm:min-h-0 ${activeTab === tab.key
                  ? 'border-brand-purple text-brand-purple'
                  : 'border-transparent text-neutral-600 hover:text-neutral-900 hover:border-neutral-300'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sort Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSortBy('recent')}
              className={`flex items-center justify-center gap-1 px-3 py-2 sm:py-1.5 text-xs font-medium rounded-full transition-colors min-h-[44px] sm:min-h-0 ${sortBy === 'recent'
                ? 'bg-brand-purple text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
            >
              <ClockIcon className="h-3.5 w-3.5 flex-shrink-0" />
              <span>Recent</span>
            </button>
            <button
              onClick={() => setSortBy('top')}
              className={`flex items-center justify-center gap-1 px-3 py-2 sm:py-1.5 text-xs font-medium rounded-full transition-colors min-h-[44px] sm:min-h-0 ${sortBy === 'top'
                ? 'bg-brand-purple text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
            >
              <SparklesIcon className="h-3.5 w-3.5 flex-shrink-0" />
              <span>Top</span>
            </button>
          </div>
        </div>
      </div>

      {/* Rich Post Composer - White Background Container */}
      {showComposer && (
        <div className="mb-4 sm:mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
            <PostComposer
              onSubmit={handleCreatePost}
              onCancel={() => setShowComposer(false)}
              isSubmitting={isSubmitting}
              showCancel={true}
              currentBranch={currentBranch || 'main'}
              currentRole={currentRole || 'admin'}
              placeholder="Share an update with your team..."
            />
          </div>
        </div>
      )}

      {/* Quick Compose (always visible when not expanded) */}
      {!showComposer && (
        <div
          onClick={() => setShowComposer(true)}
          className="mb-6 bg-white rounded-xl shadow-sm border border-neutral-200 p-4 cursor-pointer hover:border-brand-purple/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-purple flex items-center justify-center text-white font-semibold">
              {(currentUser?.first_name?.[0] || currentUser?.email?.[0] || 'U').toUpperCase()}
            </div>
            <div className="flex-1 text-neutral-400 text-sm">
              What's on your mind? Share an update, poll, or event...
            </div>
          </div>
        </div>
      )}

      {/* Posts Feed */}
      {loading && posts.length === 0 ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
          <p className="mt-4 text-neutral-600">Loading posts...</p>
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-neutral-200">
          <NewspaperIcon className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-neutral-900 mb-2">No posts yet</h3>
          <p className="text-neutral-600 mb-4">Be the first to share something with the team!</p>
          <button
            onClick={() => setShowComposer(true)}
            className="px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors font-medium"
          >
            Create First Post
          </button>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {/* Pinned Posts */}
          {pinnedPosts.length > 0 && (
            <div className="space-y-4">
              {pinnedPosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  currentUserId={currentUser?.id?.toString() || currentUser?.email}
                  currentRole={currentRole}
                  onEdit={(post) => setEditingPost(post)}
                  onDelete={handleDeleteClick}
                  onPin={handlePinPost}
                  onReport={handleReportPost}
                  onReactionUpdate={handleReactionUpdate}
                  onCommentUpdate={handleCommentUpdate}
                />
              ))}
            </div>
          )}

          {/* Regular Posts */}
          {regularPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={currentUser?.id?.toString() || currentUser?.email}
              currentRole={currentRole}
              onEdit={(post) => setEditingPost(post)}
              onDelete={handleDeleteClick}
              onPin={handlePinPost}
              onReport={handleReportPost}
              onReactionUpdate={handleReactionUpdate}
              onCommentUpdate={handleCommentUpdate}
            />
          ))}

          {/* Infinite Scroll Trigger */}
          {hasMore && (
            <div
              ref={lastPostElementRef}
              className="h-10 text-center py-4 flex justify-center w-full"
            >
              {loading && (
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-purple"></div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit Post Modal */}
      <EditPostModal
        isOpen={!!editingPost}
        onClose={() => setEditingPost(null)}
        post={editingPost}
        onPostUpdated={(updatedPost) => {
          setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p));
          setEditingPost(null);
        }}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setPostToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Post"
        message="Are you sure you want to delete this post? This action cannot be undone."
        confirmText="Delete"
        isDestructive={true}
        isLoading={isDeleting}
      />

      {/* Report Post Modal */}
      {reportModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b">
              <h2 className="text-lg font-semibold text-neutral-900">Report Post</h2>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-neutral-700 mb-2">Why are you reporting this post?</label>
              <textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Enter your reason..."
                rows={3}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3 p-6 border-t">
              <button
                onClick={() => { setReportModalOpen(false); setReportPostId(null); }}
                className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={submitReport}
                disabled={!reportReason.trim()}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
              >
                Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NewsFeedPage() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Get user from localStorage
    const userData = localStorage.getItem("user");
    if (userData && userData !== "undefined") {
      try {
        setUser(JSON.parse(userData));
      } catch (e) {
        console.error("Error parsing user data:", e);
      }
    }
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-white to-brand-light/20 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
          <p className="mt-4 text-neutral-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <RoleProvider user={user}>
      <BranchProvider user={user}>
        <NewsFeedPageContent />
      </BranchProvider>
    </RoleProvider>
  );
}
