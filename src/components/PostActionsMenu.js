import { Fragment, useState } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { EllipsisVerticalIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useToast } from '../hooks/useToast';
import ConfirmationModal from './ConfirmationModal';

export default function PostActionsMenu({ post, currentUserId, onEdit, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const toast = useToast();

  // Only show menu if user owns the post
  const isOwner = post.author_id === currentUserId || post.author_email === currentUserId;

  if (!isOwner) return null;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const response = await fetch(`/api/news-feed/posts/${post.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        setDeleteModalOpen(false);
        onDelete?.(post.id);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to delete post');
      }
    } catch (error) {
      console.error('Error deleting post:', error);
      toast.error('Failed to delete post. Please try again.');
    } finally {
      setDeleting(false);
    }
  };
  
  return (
    <Menu as="div" className="relative inline-block text-left">
      <div>
        <Menu.Button className="text-neutral-400 hover:text-neutral-600 focus:outline-none">
          <EllipsisVerticalIcon className="h-5 w-5" />
        </Menu.Button>
      </div>
      
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          <div className="py-1">
            <Menu.Item>
              {({ active }) => (
                <button
                  onClick={() => onEdit?.(post)}
                  className={`${
                    active ? 'bg-neutral-100' : ''
                  } flex items-center gap-2 w-full px-4 py-2 text-sm text-neutral-700`}
                >
                  <PencilIcon className="h-4 w-4" />
                  Edit
                </button>
              )}
            </Menu.Item>
            <Menu.Item>
              {({ active }) => (
                <button
                  onClick={() => setDeleteModalOpen(true)}
                  disabled={deleting}
                  className={`${
                    active ? 'bg-neutral-100' : ''
                  } flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 disabled:opacity-50`}
                >
                  <TrashIcon className="h-4 w-4" />
                  Delete
                </button>
              )}
            </Menu.Item>
          </div>
        </Menu.Items>
      </Transition>

      <ConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete Post"
        message="Are you sure you want to delete this post?"
        confirmText="Delete"
        isDestructive={true}
        isLoading={deleting}
      />
    </Menu>
  );
}


