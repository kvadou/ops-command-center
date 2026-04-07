import { useState, useRef } from 'react';
import {
  CloudArrowUpIcon,
  DocumentIcon,
  PhotoIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import ConfirmationModal from './ConfirmationModal';

/**
 * AttachmentUploader - File upload component for PDFs and images
 * 
 * Features:
 * - Drag and drop upload
 * - File type validation
 * - File size validation
 * - Preview for images
 * - Download existing attachments
 * - Delete attachments
 */
export default function AttachmentUploader({
  articleId,
  collectionId,
  existingAttachments = [],
  onUploadComplete,
  onDeleteAttachment,
  maxFileSize = 50 * 1024 * 1024, // 50MB
  allowedTypes = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']
}) {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState(null);
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '', isDestructive: false });
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = async (files) => {
    setError(null);
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Validate file type
      const ext = file.name.split('.').pop().toLowerCase();
      if (!allowedTypes.includes(ext)) {
        setError(`File type .${ext} is not allowed`);
        continue;
      }
      
      // Validate file size
      if (file.size > maxFileSize) {
        setError(`File ${file.name} is too large (max ${maxFileSize / 1024 / 1024}MB)`);
        continue;
      }
      
      await uploadFile(file);
    }
  };

  const uploadFile = async (file) => {
    setUploading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      if (articleId) {
        formData.append('article_id', articleId);
      }
      if (collectionId) {
        formData.append('collection_id', collectionId);
      }
      
      const response = await fetch('/api/knowledge/attachments', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      const data = await response.json();
      
      if (onUploadComplete) {
        onUploadComplete(data.attachment);
      }
    } catch (error) {
      console.error('Upload error:', error);
      setError('Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (attachmentId) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Attachment',
      message: 'Are you sure you want to delete this attachment?',
      isDestructive: true,
      action: async () => {
        try {
          const response = await fetch(`/api/knowledge/attachments/${attachmentId}`, {
            method: 'DELETE',
            credentials: 'include',
          });

          if (!response.ok) {
            throw new Error('Delete failed');
          }

          if (onDeleteAttachment) {
            onDeleteAttachment(attachmentId);
          }
        } catch (error) {
          console.error('Delete error:', error);
          setError('Failed to delete attachment.');
        }
      },
    });
  };

  const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    
    if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) {
      return <PhotoIcon className="h-8 w-8 text-blue-500" />;
    }
    
    return <DocumentIcon className="h-8 w-8 text-neutral-500" />;
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive
            ? 'border-brand-purple bg-brand-light/30'
            : 'border-neutral-300 hover:border-neutral-400'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleChange}
          className="hidden"
          accept={allowedTypes.map(t => `.${t}`).join(',')}
        />
        
        <CloudArrowUpIcon className="mx-auto h-12 w-12 text-neutral-400" />
        
        <div className="mt-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-brand-purple hover:text-brand-navy font-medium"
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : 'Click to upload'}
          </button>
          <span className="text-neutral-500"> or drag and drop</span>
        </div>
        
        <p className="mt-2 text-sm text-neutral-500">
          PDF, Images, Documents up to {maxFileSize / 1024 / 1024}MB
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4 border border-red-200">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Existing Attachments */}
      {existingAttachments.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-neutral-700">Attachments</h4>
          
          <div className="space-y-2">
            {existingAttachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg border border-neutral-200 hover:border-brand-purple transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {getFileIcon(attachment.file_name)}
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">
                      {attachment.file_name}
                    </p>
                    {attachment.file_size && (
                      <p className="text-xs text-neutral-500">
                        {formatFileSize(attachment.file_size)}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <a
                    href={`/api/knowledge/attachments/${attachment.id}/download`}
                    download
                    className="p-2 text-neutral-600 hover:text-brand-purple transition-colors"
                    title="Download"
                  >
                    <ArrowDownTrayIcon className="h-5 w-5" />
                  </a>
                  
                  <button
                    type="button"
                    onClick={() => handleDelete(attachment.id)}
                    className="p-2 text-neutral-600 hover:text-red-600 transition-colors"
                    title="Delete"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={async () => {
          if (confirmState.action) await confirmState.action();
          setConfirmState(prev => ({ ...prev, isOpen: false }));
        }}
        title={confirmState.title}
        message={confirmState.message}
        confirmText="Delete"
        isDestructive={confirmState.isDestructive}
      />
    </div>
  );
}

