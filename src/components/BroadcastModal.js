import React, { useState, useEffect } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useToast } from '../hooks/useToast';

export default function BroadcastModal({ open, onClose, onSave, broadcast }) {
  const toast = useToast();
  const [formData, setFormData] = useState({
    send_to: 'client',
    status_filter: ['live'],
    label_filter: [],
    email_style: '',
    subject: '',
    email_body: '',
  });
  const [loading, setLoading] = useState(false);
  const [labels, setLabels] = useState([]);
  const [recipientCount, setRecipientCount] = useState(0);

  useEffect(() => {
    if (open) {
      if (broadcast) {
        // Edit mode - populate form with broadcast data
        setFormData({
          send_to: broadcast.send_to || 'client',
          status_filter: broadcast.status_filter || ['live'],
          label_filter: broadcast.label_filter || [],
          email_style: broadcast.email_style || '',
          subject: broadcast.subject || '',
          email_body: broadcast.email_body || '',
        });
      } else {
        // Add mode - reset form
        setFormData({
          send_to: 'client',
          status_filter: ['live'],
          label_filter: [],
          email_style: '',
          subject: '',
          email_body: '',
        });
      }
      fetchLabels();
    }
  }, [open, broadcast]);

  useEffect(() => {
    if (open && formData.send_to) {
      calculateRecipientCount();
    }
  }, [formData.status_filter, formData.label_filter, formData.send_to, open]);

  const fetchLabels = async () => {
    try {
      const response = await fetch('/api/tutorcruncher-data/labels');
      const data = await response.json();
      if (data.labels) {
        setLabels(data.labels);
      }
    } catch (error) {
      console.error('Error fetching labels:', error);
    }
  };

  const calculateRecipientCount = async () => {
    if (!formData.send_to) return;
    
    try {
      const params = new URLSearchParams({
        send_to: formData.send_to,
        status: (formData.status_filter || []).join(','),
        labels: (formData.label_filter || []).join(',')
      });

      const response = await fetch(`/api/broadcasts/recipient-count?${params}`);
      if (response.ok) {
        const data = await response.json();
        setRecipientCount(data.count || 0);
      }
    } catch (error) {
      console.error('Error calculating recipient count:', error);
      setRecipientCount(0);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url = broadcast
        ? `/api/broadcasts/${broadcast.id}`
        : '/api/broadcasts';
      const method = broadcast ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save broadcast');
      }

      onSave();
    } catch (error) {
      console.error('Error saving broadcast:', error);
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

  const handleStatusFilterChange = (status) => {
    setFormData(prev => {
      const current = prev.status_filter || [];
      const updated = current.includes(status)
        ? current.filter(s => s !== status)
        : [...current, status];
      return { ...prev, status_filter: updated };
    });
  };

  const handleLabelFilterChange = (labelId) => {
    setFormData(prev => {
      const current = prev.label_filter || [];
      const updated = current.includes(labelId)
        ? current.filter(id => id !== labelId)
        : [...current, labelId];
      return { ...prev, label_filter: updated };
    });
  };

  const availableVariables = [
    { var: '{{login_link}}', desc: 'Full login link' },
    { var: '{{pretty_login_link}}', desc: 'Simplified login link with https:// and trailing slash removed' },
    { var: '{{company_name}}', desc: 'Name of your company, this is generally the Branch display name' },
    { var: '{{recipient_name}}', desc: 'The full name of the person receiving the email' },
    { var: '{{recipient_first_name}}', desc: 'The first name of the person receiving the email' },
    { var: '{{recipient_last_name}}', desc: 'The last name of the person receiving the email' },
  ];

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="mx-auto max-w-4xl w-full bg-white rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-6 border-b border-neutral-200 sticky top-0 bg-white z-10">
            <DialogTitle className="text-lg font-semibold text-neutral-900">
              {broadcast ? 'Edit Broadcast' : 'New Broadcast'}
            </DialogTitle>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-500"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Recipient Count Banner */}
            <div className={`p-4 rounded-lg ${recipientCount > 0 ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
              <p className="text-sm font-medium text-neutral-900">
                {recipientCount} {formData.send_to === 'client' ? 'Clients' : 'Tutors'} will receive this Broadcast.
              </p>
            </div>

            {/* Send To */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Send To *
              </label>
              <select
                name="send_to"
                value={formData.send_to}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
              >
                <option value="client">Client</option>
                <option value="contractor">Tutor</option>
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Status Filter
              </label>
              <div className="space-y-2">
                {['prospect', 'live', 'dormant'].map(status => (
                  <label key={status} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.status_filter?.includes(status)}
                      onChange={() => handleStatusFilterChange(status)}
                      className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
                    />
                    <span className="ml-2 text-sm text-neutral-700 capitalize">
                      {status === 'prospect' ? 'Prospect (Pipeline)' : status}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Label Filter */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Label Filter
              </label>
              <p className="text-xs text-neutral-500 mb-3">
                If no Labels are selected, emails will be sent to all. If multiple are selected, then only roles with all of the labels will receive a Broadcast.
              </p>
              <div className="max-h-48 overflow-y-auto border border-neutral-200 rounded-lg p-3 space-y-2">
                {labels.map(label => (
                  <label key={label.id} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.label_filter?.includes(label.id)}
                      onChange={() => handleLabelFilterChange(label.id)}
                      className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
                    />
                    <span className="ml-2 text-sm text-neutral-700">
                      {label.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Email Style */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Email Style
              </label>
              <input
                type="text"
                name="email_style"
                value={formData.email_style}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                placeholder="Which of your existing email styles to use for this Broadcast, leave blank to use your Branch's default."
              />
            </div>

            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Subject *
              </label>
              <input
                type="text"
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                placeholder="Email subject"
              />
            </div>

            {/* Email Body */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Email Body *
              </label>
              <textarea
                name="email_body"
                value={formData.email_body}
                onChange={handleChange}
                required
                rows={12}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent font-mono text-sm"
                placeholder="Email body content..."
              />
              <p className="mt-2 text-xs text-neutral-500">
                Use the variables below in your email body. They will be replaced with actual values when sent.
              </p>
            </div>

            {/* Available Variables */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Available Variables
              </label>
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 space-y-2">
                {availableVariables.map(({ var: varName, desc }) => (
                  <div key={varName} className="flex items-start">
                    <code className="text-sm font-mono text-brand-purple mr-2">{varName}</code>
                    <span className="text-xs text-neutral-600">{desc}</span>
                  </div>
                ))}
              </div>
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
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-purple rounded-lg hover:bg-brand-navy transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Saving...' : broadcast ? 'Update' : 'Save'}
              </button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

