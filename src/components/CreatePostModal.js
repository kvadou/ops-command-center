import { useState, Fragment, useRef, useEffect } from 'react';
import { Dialog, Transition, Menu } from '@headlessui/react';
import {
  XMarkIcon,
  PhotoIcon,
  FaceSmileIcon,
  MapPinIcon,
  EllipsisHorizontalIcon
} from '@heroicons/react/24/outline';
import { UserGroupIcon } from '@heroicons/react/24/solid';
import { useRole } from '../contexts/RoleContext';
import { useBranch } from '../contexts/BranchContext';
import EmojiPicker from './EmojiPicker';
import { useToast } from '../hooks/useToast';

export default function CreatePostModal({ isOpen, onClose, onPostCreated }) {
  const toast = useToast();
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState('internal');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [mentions, setMentions] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(-1);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showLocationInput, setShowLocationInput] = useState(false);
  const [location, setLocation] = useState('');
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const locationInputRef = useRef(null);
  const { currentRole } = useRole();
  const { currentBranch } = useBranch();

  // Fetch current user and users for @mentions
  useEffect(() => {
    if (isOpen) {
      fetchCurrentUser();
      fetchUsers();
    }
  }, [isOpen]);

  // Close emoji picker and location input when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
      if (locationInputRef.current && !locationInputRef.current.contains(event.target)) {
        setShowLocationInput(false);
      }
    };

    if (showEmojiPicker || showLocationInput) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showEmojiPicker, showLocationInput]);

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

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        // Ensure data is always an array
        setUsers(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      setUsers([]); // Set to empty array on error
    }
  };

  // Handle @mention detection
  const handleContentChange = (e) => {
    const value = e.target.value;
    setContent(value);
    
    // Check for @mention
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);
    const match = textBeforeCursor.match(/@(\w*)$/);
    
    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(cursorPos - match[0].length);
      setShowMentionSuggestions(true);
    } else {
      setShowMentionSuggestions(false);
    }
  };

  // Insert mention
  const insertMention = (user) => {
    const before = content.substring(0, mentionIndex);
    const after = content.substring(mentionIndex + mentionQuery.length + 1);
    const newContent = `${before}@${user.first_name || user.email.split('@')[0]} ${after}`;
    setContent(newContent);
    setMentions([...mentions, user.email]);
    setShowMentionSuggestions(false);
    setMentionQuery('');
    
    // Focus back on textarea
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = mentionIndex + `@${user.first_name || user.email.split('@')[0]} `.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  // Filter users for mention suggestions
  const filteredUsers = Array.isArray(users) ? users.filter(user => {
    if (!mentionQuery) return false;
    const query = mentionQuery.toLowerCase();
    const name = `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase();
    const email = (user.email || '').toLowerCase();
    return name.includes(query) || email.includes(query);
  }).slice(0, 5) : [];

  // Handle file upload
  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));

      const response = await fetch('/api/news-feed/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        setMediaFiles([...mediaFiles, ...data.files]);
      } else {
        toast.error('Failed to upload files');
      }
    } catch (error) {
      console.error('Error uploading files:', error);
      toast.error('Failed to upload files');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Remove media file
  const removeMedia = (index) => {
    setMediaFiles(mediaFiles.filter((_, i) => i !== index));
  };

  // Extract hashtags from content
  const extractHashtags = (text) => {
    const matches = text.match(/#\w+/g);
    return matches ? matches.map(tag => tag.substring(1)) : [];
  };

  // Extract mentions from content
  const extractMentionsFromContent = (text) => {
    const matches = text.match(/@(\w+)/g);
    return matches ? matches.map(mention => mention.substring(1)) : [];
  };

  // Handle emoji selection
  const handleEmojiSelect = (emoji) => {
    const cursorPos = textareaRef.current?.selectionStart || content.length;
    const before = content.substring(0, cursorPos);
    const after = content.substring(cursorPos);
    setContent(before + emoji + after);
    setShowEmojiPicker(false);
    
    // Focus back on textarea and set cursor position
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = cursorPos + emoji.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  // Handle location selection
  const handleLocationSelect = () => {
    if (showLocationInput) {
      // If input is already showing, just toggle it off
      setShowLocationInput(false);
      return;
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          // Use reverse geocoding API (you can use a service like OpenStreetMap Nominatim)
          try {
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
            );
            const data = await response.json();
            setLocation(data.display_name || `${latitude}, ${longitude}`);
            setShowLocationInput(false);
          } catch (error) {
            console.error('Error reverse geocoding:', error);
            setLocation(`${latitude}, ${longitude}`);
            setShowLocationInput(false);
          }
        },
        (error) => {
          // User denied or error getting location - show manual input
          console.log('Geolocation not available or denied, showing manual input');
          setShowLocationInput(true);
        }
      );
    } else {
      // Geolocation not supported - show manual input
      setShowLocationInput(true);
    }
  };

  // Handle tag people button click
  const handleTagPeopleClick = () => {
    // Insert @ at cursor position to trigger mention suggestions
    const cursorPos = textareaRef.current?.selectionStart || content.length;
    const before = content.substring(0, cursorPos);
    const after = content.substring(cursorPos);
    setContent(before + '@' + after);
    
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = cursorPos + 1;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPos, newPos);
        // Trigger mention detection
        setMentionQuery('');
        setMentionIndex(cursorPos);
        setShowMentionSuggestions(true);
      }
    }, 0);
  };

  const getUserName = () => {
    if (currentUser?.first_name && currentUser?.last_name) {
      return `${currentUser.first_name} ${currentUser.last_name}`;
    }
    if (currentUser?.email) {
      return currentUser.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    return 'User';
  };

  const getUserInitials = () => {
    if (currentUser?.first_name) {
      return currentUser.first_name[0].toUpperCase();
    }
    if (currentUser?.email) {
      return currentUser.email[0].toUpperCase();
    }
    return 'U';
  };

  const getVisibilityLabel = () => {
    switch (visibility) {
      case 'internal':
        return 'Internal';
      case 'tutors':
        return 'Tutors';
      case 'public':
        return 'Public';
      default:
        return 'Internal';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim() && mediaFiles.length === 0) return;

    setLoading(true);
    try {
      const hashtags = extractHashtags(content);
      const contentMentions = extractMentionsFromContent(content);
      const allMentions = [...new Set([...mentions, ...contentMentions])];

      const response = await fetch('/api/news-feed/posts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.trim(),
          visibility_level: visibility,
          branch_id: currentBranch || 'main',
          media_urls: mediaFiles.map(f => f.url),
          hashtags,
          mentions: allMentions,
          location: location || null
        })
      });

      if (response.ok) {
        const data = await response.json();
        setContent('');
        setVisibility('internal');
        setMediaFiles([]);
        setMentions([]);
        setShowMentionSuggestions(false);
        onPostCreated?.(data.post);
        onClose();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to create post');
      }
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error('Failed to create post. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading && !uploading) {
      setContent('');
      setVisibility('internal');
      setMediaFiles([]);
      setMentions([]);
      setLocation('');
      setShowMentionSuggestions(false);
      setShowEmojiPicker(false);
      setShowLocationInput(false);
      onClose();
    }
  };

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
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
                  <Dialog.Title className="text-xl font-semibold text-neutral-900">
                    Create post
                  </Dialog.Title>
                  <button
                    onClick={handleClose}
                    disabled={loading || uploading}
                    className="text-neutral-400 hover:text-neutral-600 focus:outline-none rounded-full p-1 hover:bg-neutral-100 transition-colors"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {/* User Info and Visibility */}
                <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-purple flex items-center justify-center text-white font-semibold text-lg">
                      {getUserInitials()}
                    </div>
                    <div>
                      <div className="text-neutral-900 font-semibold">{getUserName()}</div>
                    </div>
                  </div>
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value)}
                    className="px-3 py-1.5 bg-white text-neutral-900 rounded-lg text-sm border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    disabled={loading || uploading}
                  >
                    {currentRole === 'admin' && (
                      <>
                        <option value="internal">Internal</option>
                        <option value="tutors">Tutors</option>
                        <option value="public">Public</option>
                      </>
                    )}
                    {(currentRole === 'tutor' || currentRole === 'client' || currentRole === 'student') && (
                      <option value="tutors">Tutors</option>
                    )}
                  </select>
                </div>

                <form onSubmit={handleSubmit}>
                  {/* Content Area */}
                  <div className="px-4 py-4 relative">
                    <textarea
                      ref={textareaRef}
                      value={content}
                      onChange={handleContentChange}
                      placeholder={`What's on your mind, ${getUserName().split(' ')[0]}?`}
                      rows={8}
                      className="w-full px-0 py-2 bg-transparent text-neutral-900 placeholder-neutral-500 resize-none text-lg focus:outline-none"
                      disabled={loading || uploading}
                    />
                    
                    {/* Mention Suggestions */}
                    {showMentionSuggestions && filteredUsers.length > 0 && (
                      <div className="absolute z-10 mt-2 w-full bg-white border border-neutral-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                        {filteredUsers.map((user, idx) => (
                          <button
                            key={user.id || user.email}
                            type="button"
                            onClick={() => insertMention(user)}
                            className="w-full px-4 py-2 text-left hover:bg-neutral-100 flex items-center gap-2 transition-colors"
                          >
                            <div className="w-8 h-8 rounded-full bg-brand-purple flex items-center justify-center text-white text-xs">
                              {(user.first_name?.[0] || user.email[0] || 'U').toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-neutral-900">
                                {user.first_name && user.last_name 
                                  ? `${user.first_name} ${user.last_name}`
                                  : user.email.split('@')[0]}
                              </div>
                              <div className="text-xs text-neutral-500">{user.email}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Location Display */}
                    {location && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-neutral-600">
                        <MapPinIcon className="h-4 w-4 text-red-500" />
                        <span>{location}</span>
                        <button
                          type="button"
                          onClick={() => setLocation('')}
                          className="text-neutral-400 hover:text-neutral-600"
                        >
                          ×
                        </button>
                      </div>
                    )}

                    {/* Media Preview */}
                    {mediaFiles.length > 0 && (
                      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {mediaFiles.map((file, idx) => (
                          <div key={idx} className="relative group">
                            {file.type === 'gif' || file.url.match(/\.(gif|jpg|jpeg|png|webp)$/i) ? (
                              <img
                                src={file.url}
                                alt={`Media ${idx + 1}`}
                                className="w-full h-32 object-cover rounded-lg"
                                loading="lazy"
                              />
                            ) : (
                              <video 
                                src={file.url} 
                                className="w-full h-32 object-cover rounded-lg"
                                controls
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => removeMedia(idx)}
                              className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                  </div>

                  {/* Add to your post toolbar */}
                  <div className="px-4 py-3 border-t border-neutral-200">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-600 text-sm font-medium">Add to your post</span>
                      <div className="flex items-center gap-1">
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept="image/*,video/*"
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={loading || uploading}
                          className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
                          title="Photo/Video"
                        >
                          <PhotoIcon className="h-6 w-6 text-green-500" />
                        </button>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={handleTagPeopleClick}
                            disabled={loading || uploading}
                            className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
                            title="Tag people"
                          >
                            <UserGroupIcon className="h-6 w-6 text-blue-500" />
                          </button>
                        </div>
                        <div className="relative" ref={emojiPickerRef}>
                          <button
                            type="button"
                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                            disabled={loading || uploading}
                            className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
                            title="Emoji"
                          >
                            <FaceSmileIcon className="h-6 w-6 text-yellow-500" />
                          </button>
                          {showEmojiPicker && (
                            <EmojiPicker
                              onEmojiSelect={handleEmojiSelect}
                              onClose={() => setShowEmojiPicker(false)}
                            />
                          )}
                        </div>
                        <div className="relative" ref={locationInputRef}>
                          <button
                            type="button"
                            onClick={handleLocationSelect}
                            disabled={loading || uploading}
                            className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
                            title="Location"
                          >
                            <MapPinIcon className="h-6 w-6 text-red-500" />
                          </button>
                          {showLocationInput && (
                            <div className="absolute bottom-full right-0 mb-2 w-64 bg-white border border-neutral-200 rounded-lg shadow-xl z-50 p-3">
                              <input
                                type="text"
                                placeholder="Enter location..."
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                onKeyPress={(e) => {
                                  if (e.key === 'Enter') {
                                    setShowLocationInput(false);
                                  }
                                }}
                                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple"
                                autoFocus
                              />
                              <div className="flex gap-2 mt-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLocation('');
                                    setShowLocationInput(false);
                                  }}
                                  className="px-3 py-1.5 text-sm text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200"
                                >
                                  Clear
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setShowLocationInput(false)}
                                  className="px-3 py-1.5 text-sm text-white bg-brand-purple rounded-lg hover:bg-brand-navy"
                                >
                                  Done
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        <Menu as="div" className="relative">
                          <Menu.Button
                            type="button"
                            disabled={loading || uploading}
                            className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
                            title="More options"
                          >
                            <EllipsisHorizontalIcon className="h-6 w-6 text-neutral-400" />
                          </Menu.Button>
                          <Menu.Items className="absolute right-0 bottom-full mb-2 w-48 bg-white border border-neutral-200 rounded-lg shadow-xl z-50 py-1">
                            <Menu.Item>
                              {({ active }) => (
                                <button
                                  type="button"
                                  className={`${
                                    active ? 'bg-neutral-100' : ''
                                  } w-full text-left px-4 py-2 text-sm text-neutral-700`}
                                >
                                  Schedule post
                                </button>
                              )}
                            </Menu.Item>
                            <Menu.Item>
                              {({ active }) => (
                                <button
                                  type="button"
                                  className={`${
                                    active ? 'bg-neutral-100' : ''
                                  } w-full text-left px-4 py-2 text-sm text-neutral-700`}
                                >
                                  Save as draft
                                </button>
                              )}
                            </Menu.Item>
                            {location && (
                              <Menu.Item>
                                {({ active }) => (
                                  <button
                                    type="button"
                                    onClick={() => setLocation('')}
                                    className={`${
                                      active ? 'bg-neutral-100' : ''
                                    } w-full text-left px-4 py-2 text-sm text-red-600`}
                                  >
                                    Remove location
                                  </button>
                                )}
                              </Menu.Item>
                            )}
                          </Menu.Items>
                        </Menu>
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="px-4 py-3 border-t border-neutral-200">
                    <button
                      type="submit"
                      disabled={loading || uploading || (!content.trim() && mediaFiles.length === 0)}
                      className="w-full py-2.5 bg-brand-purple text-white font-semibold rounded-lg hover:bg-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-purple focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {loading ? 'Posting...' : uploading ? 'Uploading...' : 'Post'}
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
