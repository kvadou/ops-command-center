import React, { useRef, useState } from 'react';
import { PhotoIcon } from '@heroicons/react/24/outline';

export default function ImageBlockEditor({ block, onChange, onUpload }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (file && onUpload) {
      setUploading(true);
      try {
        const url = await onUpload(file);
        if (url) {
          onChange({ ...block, url });
        }
      } finally {
        setUploading(false);
      }
    }
  };

  return (
    <div className="space-y-3">
      {block.url ? (
        <div className="relative">
          <img
            src={block.url}
            alt={block.alt || ''}
            className="w-full rounded-lg max-h-96 object-contain bg-neutral-50"
          />
          <button
            onClick={() => onChange({ ...block, url: '' })}
            className="absolute top-2 right-2 px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
          >
            Remove
          </button>
        </div>
      ) : (
        <div
          onClick={() => !uploading && fileRef.current?.click()}
          className={`border-2 border-dashed border-neutral-300 rounded-lg p-8 text-center cursor-pointer transition-colors ${
            uploading ? 'opacity-50 cursor-wait' : 'hover:border-brand-purple hover:bg-brand-purple/5'
          }`}
        >
          <PhotoIcon className="h-12 w-12 mx-auto text-neutral-400" />
          <p className="mt-2 text-sm text-neutral-600">
            {uploading ? 'Uploading...' : 'Click to upload an image'}
          </p>
          <p className="text-xs text-neutral-400">PNG, JPG, GIF up to 10MB</p>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      <input
        type="text"
        value={block.caption || ''}
        onChange={(e) => onChange({ ...block, caption: e.target.value })}
        placeholder="Caption (optional)"
        className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
      />
      <input
        type="text"
        value={block.alt || ''}
        onChange={(e) => onChange({ ...block, alt: e.target.value })}
        placeholder="Alt text for accessibility"
        className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
      />
    </div>
  );
}
