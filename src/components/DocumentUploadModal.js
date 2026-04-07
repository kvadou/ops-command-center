import React, { useState, useEffect } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon, DocumentArrowUpIcon } from '@heroicons/react/24/outline';
import { useToast } from '../hooks/useToast';

export default function DocumentUploadModal({ open, onClose, onSave }) {
  const toast = useToast();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'other',
    client_id: '',
    contractor_id: ''
  });
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState([]);
  const [tutors, setTutors] = useState([]);

  useEffect(() => {
    if (open) {
      // Reset form when modal opens
      setFormData({
        name: '',
        description: '',
        type: 'other',
        client_id: '',
        contractor_id: ''
      });
      setFile(null);
      fetchClients();
      fetchTutors();
    }
  }, [open]);

  const fetchClients = async () => {
    try {
      const response = await fetch('/api/entity-lists/clients?limit=1000');
      const data = await response.json();
      if (data.clients) {
        setClients(data.clients);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const fetchTutors = async () => {
    try {
      const response = await fetch('/api/entity-lists/tutors?limit=1000');
      const data = await response.json();
      if (data.tutors) {
        setTutors(data.tutors);
      }
    } catch (error) {
      console.error('Error fetching tutors:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!file) {
      toast.error('Please select a file to upload');
      return;
    }

    setLoading(true);

    try {
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);
      uploadFormData.append('name', formData.name || file.name);
      uploadFormData.append('description', formData.description || '');
      uploadFormData.append('type', formData.type);
      uploadFormData.append('client_id', formData.client_id || '');
      uploadFormData.append('contractor_id', formData.contractor_id || '');

      const response = await fetch('/api/documents', {
        method: 'POST',
        body: uploadFormData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload document');
      }

      onSave();
    } catch (error) {
      console.error('Error uploading document:', error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      // Auto-fill name if empty
      if (!formData.name) {
        setFormData(prev => ({
          ...prev,
          name: selectedFile.name
        }));
      }
    }
  };

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="mx-auto max-w-2xl w-full bg-white rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-6 border-b border-neutral-200 sticky top-0 bg-white z-10">
            <DialogTitle className="text-lg font-semibold text-neutral-900">
              Upload Document
            </DialogTitle>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-500"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                File *
              </label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-neutral-300 border-dashed rounded-lg hover:border-brand-purple transition-colors">
                <div className="space-y-1 text-center">
                  <DocumentArrowUpIcon className="mx-auto h-12 w-12 text-neutral-400" />
                  <div className="flex text-sm text-neutral-600">
                    <label className="relative cursor-pointer bg-white rounded-md font-medium text-brand-purple hover:text-brand-navy focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-brand-purple">
                      <span>Upload a file</span>
                      <input
                        type="file"
                        className="sr-only"
                        onChange={handleFileChange}
                        required
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-neutral-500">PDF, DOC, DOCX, XLS, XLSX, PNG, JPG up to 10MB</p>
                  {file && (
                    <p className="text-sm text-neutral-900 mt-2">{file.name}</p>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                placeholder="Document name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                placeholder="Document description..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Type *
                </label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                >
                  <option value="contract">Contract</option>
                  <option value="report">Report</option>
                  <option value="certificate">Certificate</option>
                  <option value="invoice">Invoice</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Client
                </label>
                <select
                  name="client_id"
                  value={formData.client_id}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                >
                  <option value="">Select a client...</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.client_id || client.id}>
                      {client.first_name} {client.last_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Tutor
              </label>
              <select
                name="contractor_id"
                value={formData.contractor_id}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
              >
                <option value="">Select a tutor...</option>
                {tutors.map(tutor => (
                  <option key={tutor.id} value={tutor.contractor_id || tutor.id}>
                    {tutor.first_name} {tutor.last_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !file}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-purple rounded-lg hover:bg-brand-navy transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

