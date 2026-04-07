/**
 * PostComposer - Full-featured Post Creation Component
 * 
 * Features:
 * - Rich text editing with TiptapEditor
 * - Multi-image/video upload
 * - Poll creation
 * - Event creation
 * - Visibility/audience selector
 * - Location tagging
 * - GIF picker
 * - Link Preview detection
 */

import React, { useState, useRef, useCallback } from 'react';
import TiptapEditor from './TiptapEditor';
import VisibilitySelector from './VisibilitySelector';
import PollCreator from './PollCreator';
import EventCreator from './EventCreator';
import LinkPreview from './LinkPreview';
import {
  PhotoIcon,
  ChartBarIcon,
  CalendarDaysIcon,
  MapPinIcon,
  GifIcon,
  XMarkIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';

const PostComposer = ({
  onSubmit,
  onCancel,
  initialContent = '',
  initialVisibility = 'internal',
  isSubmitting = false,
  submitButtonText = 'Post',
  placeholder = "Share an update with your team...",
  showCancel = false,
  compact = false,
  currentBranch = 'main',
  currentRole = 'admin',
}) => {
  const editorRef = useRef(null);
  const [visibility, setVisibility] = useState(initialVisibility);
  const [targetBranches, setTargetBranches] = useState([]);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [showEventCreator, setShowEventCreator] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [pollData, setPollData] = useState(null);
  const [eventData, setEventData] = useState(null);
  const [locationTag, setLocationTag] = useState('');
  const [showLocationInput, setShowLocationInput] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [gifSearchQuery, setGifSearchQuery] = useState('');
  const [gifResults, setGifResults] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [linkPreview, setLinkPreview] = useState(null);
  const linkDebounceRef = useRef(null);

  // Handle editor changes to detect links
  const handleEditorChange = useCallback(({ text }) => {
    // Regex to find first URL
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const match = text.match(urlRegex);

    if (match && match[0]) {
      const url = match[0];

      // If we already have this preview, skip
      if (linkPreview && linkPreview.url === url) return;

      // Clear existing timer
      if (linkDebounceRef.current) clearTimeout(linkDebounceRef.current);

      // Debounce fetch
      linkDebounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/news-feed/link-preview?url=${encodeURIComponent(url)}`, {
            credentials: 'include',
          });
          if (res.ok) {
            const data = await res.json();
            // Only set if we got meaningful data
            if (data.title || data.image) {
              setLinkPreview(data);
            }
          }
        } catch (err) {
          console.error('Error fetching link preview:', err);
        }
      }, 1000); // 1 second debounce
    }
  }, [linkPreview]);

  // Handle image upload to Cloudinary
  const handleImageUpload = useCallback(async (file) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('files', file);

      const response = await fetch('/api/news-feed/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.files && data.files.length > 0) {
          const uploadedFile = data.files[0];
          setMediaFiles(prev => [...prev, {
            url: uploadedFile.url,
            type: uploadedFile.resource_type === 'video' ? 'video' : 'image',
            publicId: uploadedFile.public_id,
          }]);
          return uploadedFile.url;
        }
      }
    } catch (error) {
      console.error('Error uploading image:', error);
    } finally {
      setIsUploading(false);
    }
    return null;
  }, []);

  // Handle GIF search
  const searchGifs = async (query) => {
    if (!query.trim()) {
      setGifResults([]);
      return;
    }

    setGifLoading(true);
    try {
      const response = await fetch(`/api/news-feed/giphy/search?q=${encodeURIComponent(query)}&limit=12`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setGifResults(data.data || []);
      }
    } catch (error) {
      console.error('Error searching GIFs:', error);
    } finally {
      setGifLoading(false);
    }
  };

  // Add GIF to media
  const addGif = (gif) => {
    const gifUrl = gif.images?.fixed_height?.url || gif.images?.original?.url;
    if (gifUrl) {
      setMediaFiles(prev => [...prev, {
        url: gifUrl,
        type: 'gif',
        gifId: gif.id,
      }]);
    }
    setShowGifPicker(false);
    setGifSearchQuery('');
    setGifResults([]);
  };

  // Remove media file
  const removeMedia = (index) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Handle form submission
  const handleSubmit = async () => {
    const editorContent = editorRef.current?.getContent();

    if (!editorContent?.text?.trim() && mediaFiles.length === 0 && !pollData && !eventData && !linkPreview) {
      return;
    }

    const postData = {
      content: editorContent?.text || '',
      content_html: editorContent?.html || '',
      content_json: editorContent?.json || null,
      visibility_level: visibility,
      target_branches: targetBranches,
      media_urls: mediaFiles.map(f => f.url),
      mentions: editorContent?.mentions || [],
      poll_data: pollData,
      event_data: eventData,
      link_preview: linkPreview,
      location_tag: locationTag || null,
      post_type: pollData ? 'poll' : eventData ? 'event' : mediaFiles.length > 0 ? 'media' : 'text',
    };

    if (onSubmit) {
      await onSubmit(postData);

      // Clear form after successful submission
      editorRef.current?.clearContent();
      setMediaFiles([]);
      setPollData(null);
      setEventData(null);
      setLinkPreview(null);
      setLocationTag('');
      setShowPollCreator(false);
      setShowEventCreator(false);
    }
  };

  // Determine what post types are available based on role
  const canCreatePoll = ['admin', 'staff', 'franchisee'].includes(currentRole);
  const canCreateEvent = ['admin', 'staff', 'franchisee'].includes(currentRole);
  const canAddLocation = true;

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-neutral-200 ${compact ? 'p-3' : 'p-4'}`}>
      {/* Editor */}
      <div className="mb-3">
        <TiptapEditor
          ref={editorRef}
          content={initialContent}
          onChange={handleEditorChange}
          placeholder={placeholder}
          minHeight={compact ? '60px' : '100px'}
          maxHeight="300px"
          showToolbar={!compact}
          onImageUpload={handleImageUpload}
          className="border border-neutral-200 rounded-lg"
        />
      </div>

      {/* Media Preview */}
      {mediaFiles.length > 0 && (
        <div className="mb-3">
          <div className="flex flex-wrap gap-2">
            {mediaFiles.map((media, index) => (
              <div key={index} className="relative group">
                {media.type === 'video' ? (
                  <video
                    src={media.url}
                    className="w-24 h-24 object-cover rounded-lg"
                    muted
                  />
                ) : (
                  <img
                    src={media.url}
                    alt={`Upload ${index + 1}`}
                    className="w-24 h-24 object-cover rounded-lg"
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeMedia(index)}
                  className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Poll Preview */}
      {pollData && (
        <div className="mb-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ChartBarIcon className="h-5 w-5 text-brand-purple" />
              <span className="font-medium text-neutral-900">Poll</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setPollData(null);
                setShowPollCreator(false);
              }}
              className="text-neutral-400 hover:text-red-500"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
          <p className="text-sm font-medium text-neutral-700 mb-2">{pollData.question}</p>
          <div className="space-y-1">
            {pollData.options.map((option, i) => (
              <div key={i} className="text-sm text-neutral-600 bg-white px-3 py-1.5 rounded border border-neutral-200">
                {option}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event Preview */}
      {eventData && (
        <div className="mb-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <CalendarDaysIcon className="h-5 w-5 text-brand-purple" />
              <span className="font-medium text-neutral-900">Event</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setEventData(null);
                setShowEventCreator(false);
              }}
              className="text-neutral-400 hover:text-red-500"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
          <p className="text-sm font-medium text-neutral-700">{eventData.title}</p>
          <p className="text-xs text-neutral-500 mt-1">
            {new Date(eventData.start_date).toLocaleDateString()} at {new Date(eventData.start_date).toLocaleTimeString()}
          </p>
          {eventData.location && (
            <p className="text-xs text-neutral-500">📍 {eventData.location}</p>
          )}
        </div>
      )}

      {/* Link Preview */}
      {linkPreview && (
        <div className="mb-3 relative group">
          <LinkPreview preview={linkPreview} />
          <button
            type="button"
            onClick={() => setLinkPreview(null)}
            className="absolute top-2 right-2 p-1 bg-neutral-900/50 hover:bg-neutral-900/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Location Tag */}
      {locationTag && (
        <div className="mb-3 flex items-center gap-2 text-sm text-neutral-600">
          <MapPinIcon className="h-4 w-4" />
          <span>{locationTag}</span>
          <button
            type="button"
            onClick={() => setLocationTag('')}
            className="text-neutral-400 hover:text-red-500"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Poll Creator Modal */}
      {showPollCreator && (
        <div className="mb-3">
          <PollCreator
            onSave={(data) => {
              setPollData(data);
              setShowPollCreator(false);
            }}
            onCancel={() => setShowPollCreator(false)}
          />
        </div>
      )}

      {/* Event Creator Modal */}
      {showEventCreator && (
        <div className="mb-3">
          <EventCreator
            onSave={(data) => {
              setEventData(data);
              setShowEventCreator(false);
            }}
            onCancel={() => setShowEventCreator(false)}
          />
        </div>
      )}

      {/* Location Input */}
      {showLocationInput && (
        <div className="mb-3 flex items-center gap-2">
          <MapPinIcon className="h-5 w-5 text-neutral-400" />
          <input
            type="text"
            value={locationTag}
            onChange={(e) => setLocationTag(e.target.value)}
            placeholder="Add location..."
            className="flex-1 text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowLocationInput(false)}
            className="text-neutral-400 hover:text-neutral-600"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* GIF Picker */}
      {showGifPicker && (
        <div className="mb-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-neutral-900">Add GIF</span>
            <button
              type="button"
              onClick={() => {
                setShowGifPicker(false);
                setGifSearchQuery('');
                setGifResults([]);
              }}
              className="text-neutral-400 hover:text-neutral-600"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
          <input
            type="text"
            value={gifSearchQuery}
            onChange={(e) => {
              setGifSearchQuery(e.target.value);
              searchGifs(e.target.value);
            }}
            placeholder="Search GIFs..."
            className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
          />
          {gifLoading ? (
            <div className="text-center py-4 text-neutral-500 text-sm">Loading...</div>
          ) : gifResults.length > 0 ? (
            <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
              {gifResults.map((gif) => (
                <button
                  key={gif.id}
                  type="button"
                  onClick={() => addGif(gif)}
                  className="hover:opacity-75 transition-opacity"
                >
                  <img
                    src={gif.images?.fixed_height_small?.url}
                    alt={gif.title}
                    className="w-full h-16 object-cover rounded"
                  />
                </button>
              ))}
            </div>
          ) : gifSearchQuery && (
            <div className="text-center py-4 text-neutral-500 text-sm">No GIFs found</div>
          )}
        </div>
      )}

      {/* Action Bar */}
      <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
        {/* Left: Attachment Options */}
        <div className="flex items-center gap-1">
          {/* Photo/Video Upload */}
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                for (const file of files) {
                  await handleImageUpload(file);
                }
                e.target.value = '';
              }}
            />
            <div className="p-2 rounded-lg text-neutral-500 hover:text-brand-purple hover:bg-brand-purple/10 transition-colors" title="Add Photo/Video">
              <PhotoIcon className="h-5 w-5" />
            </div>
          </label>

          {/* GIF Button */}
          <button
            type="button"
            onClick={() => setShowGifPicker(!showGifPicker)}
            className={`p-2 rounded-lg transition-colors ${showGifPicker ? 'text-brand-purple bg-brand-purple/10' : 'text-neutral-500 hover:text-brand-purple hover:bg-brand-purple/10'
              }`}
            title="Add GIF"
          >
            <GifIcon className="h-5 w-5" />
          </button>

          {/* Poll Button */}
          {canCreatePoll && !pollData && (
            <button
              type="button"
              onClick={() => setShowPollCreator(!showPollCreator)}
              className={`p-2 rounded-lg transition-colors ${showPollCreator ? 'text-brand-purple bg-brand-purple/10' : 'text-neutral-500 hover:text-brand-purple hover:bg-brand-purple/10'
                }`}
              title="Create Poll"
            >
              <ChartBarIcon className="h-5 w-5" />
            </button>
          )}

          {/* Event Button */}
          {canCreateEvent && !eventData && (
            <button
              type="button"
              onClick={() => setShowEventCreator(!showEventCreator)}
              className={`p-2 rounded-lg transition-colors ${showEventCreator ? 'text-brand-purple bg-brand-purple/10' : 'text-neutral-500 hover:text-brand-purple hover:bg-brand-purple/10'
                }`}
              title="Create Event"
            >
              <CalendarDaysIcon className="h-5 w-5" />
            </button>
          )}

          {/* Location Button */}
          {canAddLocation && !locationTag && (
            <button
              type="button"
              onClick={() => setShowLocationInput(!showLocationInput)}
              className={`p-2 rounded-lg transition-colors ${showLocationInput ? 'text-brand-purple bg-brand-purple/10' : 'text-neutral-500 hover:text-brand-purple hover:bg-brand-purple/10'
                }`}
              title="Add Location"
            >
              <MapPinIcon className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Right: Visibility + Submit */}
        <div className="flex items-center gap-3">
          <VisibilitySelector
            value={visibility}
            onChange={setVisibility}
            targetBranches={targetBranches}
            onTargetBranchesChange={setTargetBranches}
            currentBranch={currentBranch}
            currentRole={currentRole}
          />

          {showCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              Cancel
            </button>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || isUploading}
            className="flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                <span>Posting...</span>
              </>
            ) : (
              <>
                <PaperAirplaneIcon className="h-4 w-4" />
                <span>{submitButtonText}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PostComposer;
