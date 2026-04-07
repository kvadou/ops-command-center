/**
 * MediaUploader - Drag and drop media upload component
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  PhotoIcon,
  VideoCameraIcon,
  XMarkIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline';

const MediaUploader = ({
  files = [],
  onFilesChange,
  onUpload,
  maxFiles = 10,
  maxFileSize = 50 * 1024 * 1024, // 50MB default
  acceptedTypes = ['image/*', 'video/*'],
  showPreviews = true,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [errors, setErrors] = useState([]);
  const fileInputRef = useRef(null);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const validateFile = (file) => {
    // Check file size
    if (file.size > maxFileSize) {
      return `File "${file.name}" is too large. Maximum size is ${Math.round(maxFileSize / 1024 / 1024)}MB.`;
    }

    // Check file type
    const isValidType = acceptedTypes.some(type => {
      if (type.endsWith('/*')) {
        const baseType = type.replace('/*', '');
        return file.type.startsWith(baseType);
      }
      return file.type === type;
    });

    if (!isValidType) {
      return `File "${file.name}" is not a supported type.`;
    }

    return null;
  };

  const processFiles = useCallback(async (newFiles) => {
    const validFiles = [];
    const newErrors = [];

    // Check total file count
    if (files.length + newFiles.length > maxFiles) {
      newErrors.push(`You can only upload up to ${maxFiles} files.`);
      setErrors(newErrors);
      return;
    }

    for (const file of newFiles) {
      const error = validateFile(file);
      if (error) {
        newErrors.push(error);
      } else {
        validFiles.push(file);
      }
    }

    setErrors(newErrors);

    if (validFiles.length === 0) return;

    // Upload files
    for (const file of validFiles) {
      try {
        setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));
        
        const url = await onUpload(file, (progress) => {
          setUploadProgress(prev => ({ ...prev, [file.name]: progress }));
        });

        if (url) {
          const newFile = {
            url,
            name: file.name,
            type: file.type.startsWith('video') ? 'video' : 'image',
            size: file.size,
          };
          onFilesChange([...files, newFile]);
        }
      } catch (error) {
        newErrors.push(`Failed to upload "${file.name}": ${error.message}`);
        setErrors(prev => [...prev, `Failed to upload "${file.name}"`]);
      } finally {
        setUploadProgress(prev => {
          const updated = { ...prev };
          delete updated[file.name];
          return updated;
        });
      }
    }
  }, [files, maxFiles, onUpload, onFilesChange]);

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    processFiles(droppedFiles);
  };

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    processFiles(selectedFiles);
    e.target.value = ''; // Reset input
  };

  const removeFile = (index) => {
    const newFiles = files.filter((_, i) => i !== index);
    onFilesChange(newFiles);
  };

  const isUploading = Object.keys(uploadProgress).length > 0;

  return (
    <div className="space-y-3">
      {/* Drop Zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
          transition-colors duration-200
          ${isDragging 
            ? 'border-brand-purple bg-brand-purple/5' 
            : 'border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50'
          }
          ${isUploading ? 'pointer-events-none opacity-50' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedTypes.join(',')}
          multiple={maxFiles > 1}
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-2">
          <div className={`p-3 rounded-full ${isDragging ? 'bg-brand-purple/10' : 'bg-neutral-100'}`}>
            <ArrowUpTrayIcon className={`h-6 w-6 ${isDragging ? 'text-brand-purple' : 'text-neutral-400'}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-700">
              {isDragging ? 'Drop files here' : 'Drag and drop or click to upload'}
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              Images and videos up to {Math.round(maxFileSize / 1024 / 1024)}MB
            </p>
          </div>
        </div>
      </div>

      {/* Upload Progress */}
      {isUploading && (
        <div className="space-y-2">
          {Object.entries(uploadProgress).map(([name, progress]) => (
            <div key={name} className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs text-neutral-600 mb-1">
                  <span className="truncate">{name}</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-brand-purple transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          {errors.map((error, i) => (
            <p key={i} className="text-sm text-red-600">{error}</p>
          ))}
        </div>
      )}

      {/* File Previews */}
      {showPreviews && files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <div key={index} className="relative group">
              {file.type === 'video' ? (
                <div className="w-24 h-24 bg-neutral-100 rounded-lg flex items-center justify-center">
                  <VideoCameraIcon className="h-8 w-8 text-neutral-400" />
                </div>
              ) : (
                <img
                  src={file.url}
                  alt={file.name || `Upload ${index + 1}`}
                  className="w-24 h-24 object-cover rounded-lg"
                />
              )}
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* File Count */}
      {files.length > 0 && (
        <p className="text-xs text-neutral-500">
          {files.length} of {maxFiles} files uploaded
        </p>
      )}
    </div>
  );
};

export default MediaUploader;

