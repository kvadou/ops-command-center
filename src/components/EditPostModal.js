import { useState, Fragment, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useRole } from '../contexts/RoleContext';
import { useBranch } from '../contexts/BranchContext';
import { useToast } from '../hooks/useToast';

export default function EditPostModal({ isOpen, onClose, post, onPostUpdated }) {
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState('internal');
  const [loading, setLoading] = useState(false);
  const { currentRole } = useRole();
  const { currentBranch } = useBranch();
  const toast = useToast();

  useEffect(() => {
    if (post) {
      setContent(post.content || '');
      setVisibility(post.visibility_level || 'internal');
    }
  }, [post]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/news-feed/posts/${post.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.trim(),
          visibility_level: visibility
        })
      });

      if (response.ok) {
        const data = await response.json();
        onPostUpdated?.(data.post);
        onClose();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to update post');
      }
    } catch (error) {
      console.error('Error updating post:', error);
      toast.error('Failed to update post. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setContent('');
      setVisibility('internal');
      onClose();
    }
  };

  if (!post) return null;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-xl bg-white shadow-xl transition-all">
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
                  <Dialog.Title className="text-lg font-semibold text-neutral-900">
                    Edit Post
                  </Dialog.Title>
                  <button
                    onClick={handleClose}
                    disabled={loading}
                    className="text-neutral-400 hover:text-neutral-500 focus:outline-none"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={handleSubmit}>
                  <div className="px-6 py-4">
                    <div className="mb-4">
                      <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="What's on your mind?"
                        rows={6}
                        className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple resize-none text-sm"
                        disabled={loading}
                        required
                      />
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Visibility
                      </label>
                      <select
                        value={visibility}
                        onChange={(e) => setVisibility(e.target.value)}
                        className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
                        disabled={loading}
                      >
                        {currentRole === 'admin' && (
                          <>
                            <option value="internal">Internal (Operations Team Only)</option>
                            <option value="tutors">Tutors</option>
                            <option value="public">Public (Everyone)</option>
                          </>
                        )}
                        {(currentRole === 'tutor' || currentRole === 'client' || currentRole === 'student') && (
                          <option value="tutors">Tutors</option>
                        )}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 px-6 py-4 bg-neutral-50 border-t border-neutral-200">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={loading}
                      className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:ring-offset-2 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading || !content.trim()}
                      className="px-4 py-2 text-sm font-medium text-white bg-brand-purple rounded-lg hover:bg-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-purple focus:ring-offset-2 disabled:opacity-50"
                    >
                      {loading ? 'Updating...' : 'Update'}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}


