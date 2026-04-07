import React, { useRef, useState } from 'react';
import { DocumentIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';

export default function FileBlockEditor({ block, onChange, onUpload }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (file && onUpload) {
      setUploading(true);
      try {
        const url = await onUpload(file);
        if (url) {
          onChange({ ...block, url, filename: file.name });
        }
      } finally {
        setUploading(false);
      }
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={block.title || ''}
        onChange={(e) => onChange({ ...block, title: e.target.value })}
        placeholder="File title"
        className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
      />
      {block.url ? (
        <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg">
          <DocumentIcon className="h-8 w-8 text-brand-purple flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-neutral-900 truncate">{block.filename || 'File'}</p>
            <a
              href={block.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-brand-purple hover:underline"
            >
              View file
            </a>
          </div>
          <button
            onClick={() => onChange({ ...block, url: '', filename: '' })}
            className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
          >
            Remove
          </button>
        </div>
      ) : (
        <div
          onClick={() => !uploading && fileRef.current?.click()}
          className={`border-2 border-dashed border-neutral-300 rounded-lg p-6 text-center cursor-pointer transition-colors ${
            uploading ? 'opacity-50 cursor-wait' : 'hover:border-brand-purple hover:bg-brand-purple/5'
          }`}
        >
          <ArrowUpTrayIcon className="h-8 w-8 mx-auto text-neutral-400" />
          <p className="mt-2 text-sm text-neutral-600">
            {uploading ? 'Uploading...' : 'Click to upload a file'}
          </p>
          <p className="text-xs text-neutral-400">PDF, DOC, XLS, PPT up to 50MB</p>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        onChange={handleFileSelect}
        className="hidden"
      />
      <textarea
        value={block.description || ''}
        onChange={(e) => onChange({ ...block, description: e.target.value })}
        placeholder="Description (optional)"
        rows={2}
        className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple resize-none"
      />
    </div>
  );
}
