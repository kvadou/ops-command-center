import React, { useState, useRef } from 'react';
import ConfirmationModal from './ConfirmationModal';
import { LinkIcon, TrashIcon, PaperClipIcon } from '@heroicons/react/24/outline';

export default function PublicFilesPage() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  React.useEffect(() => {
    fetchFiles();
  }, [search]);

  const fetchFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: 1, limit: 100 });
      if (search) {
        params.append('search', search);
      }
      const response = await fetch(`/api/public-files?${params}`);
      if (!response.ok) throw new Error('Failed to fetch files');
      const data = await response.json();
      setFiles(data.data || data['public-files'] || []);
    } catch (err) {
      console.error('Error fetching files:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/public-files', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload file');
      }

      await fetchFiles(); // Refresh list
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (fileId, fileName) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete File',
      message: `Are you sure you want to delete "${fileName}"?`,
      action: async () => {
        try {
          const response = await fetch(`/api/public-files/${fileId}`, {
            method: 'DELETE'
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete file');
          }

          await fetchFiles();
        } catch (err) {
          console.error('Error deleting file:', err);
          setError(err.message);
        }
      },
    });
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
      });
    } catch (error) {
      return dateString;
    }
  };

  const getFileUrl = (filePath) => {
    // Return the public URL for the file
    return filePath.startsWith('/') ? filePath : `/${filePath}`;
  };

  return (
      <div className="max-w-7xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-neutral-900">Public uploads</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Upload public media files eg. images for use in emails, pdfs, custom site theming. Note: These files are publicly available.
          </p>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 mb-6">
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            New Upload
          </label>
          <div className="flex items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              disabled={uploading}
              className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {uploading && (
              <div className="flex items-center gap-2 text-sm text-neutral-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand-purple"></div>
                <span>Uploading...</span>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Files Table */}
        {loading ? (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
            <p className="mt-4 text-sm text-neutral-600">Loading files...</p>
          </div>
        ) : files.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
            <PaperClipIcon className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
            <p className="text-sm text-neutral-600">No files uploaded yet</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      File Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      Uploader
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      Date Uploaded
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-neutral-200">
                  {files.map((file) => (
                    <tr key={file.id} className="hover:bg-neutral-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <LinkIcon className="h-4 w-4 text-neutral-400" />
                          <a
                            href={getFileUrl(file.file_path)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-brand-purple hover:text-brand-navy"
                          >
                            {file.original_name}
                          </a>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                        {file.uploader_name || 'Unknown'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                        {formatDate(file.date_uploaded)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleDelete(file.id, file.original_name)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <TrashIcon className="h-4 w-4" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
  );
}

