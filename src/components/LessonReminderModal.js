import React, { useState, useEffect } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useToast } from '../hooks/useToast';

export default function LessonReminderModal({ isOpen, onClose, reminder }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [labels, setLabels] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    enabled: true,
    label_ids: [],
    recipient_types: [],
    send_to_associated_clients: false,
    delivery_time_offset: ''
  });

  useEffect(() => {
    if (isOpen) {
      fetchLabels();
      if (reminder) {
        // Parse JSONB fields
        setFormData({
          name: reminder.name || '',
          enabled: reminder.enabled !== undefined ? reminder.enabled : true,
          label_ids: Array.isArray(reminder.label_ids) ? reminder.label_ids : 
                     (typeof reminder.label_ids === 'string' ? JSON.parse(reminder.label_ids || '[]') : []),
          recipient_types: Array.isArray(reminder.recipient_types) ? reminder.recipient_types :
                          (typeof reminder.recipient_types === 'string' ? JSON.parse(reminder.recipient_types || '[]') : []),
          send_to_associated_clients: reminder.send_to_associated_clients || false,
          delivery_time_offset: reminder.delivery_time_offset || ''
        });
      } else {
        setFormData({
          name: '',
          enabled: true,
          label_ids: [],
          recipient_types: [],
          send_to_associated_clients: false,
          delivery_time_offset: ''
        });
      }
    }
  }, [isOpen, reminder]);

  const fetchLabels = async () => {
    try {
      const response = await fetch('/api/labels/local');
      if (response.ok) {
        const data = await response.json();
        setLabels(data.labels || []);
      }
    } catch (error) {
      console.error('Error fetching labels:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url = reminder 
        ? `/api/lesson-reminders/${reminder.id}`
        : '/api/lesson-reminders';
      
      const method = reminder ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save reminder');
      }

      onClose();
    } catch (error) {
      console.error('Error saving reminder:', error);
      toast.error(`Error saving reminder: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleLabel = (labelId) => {
    setFormData(prev => ({
      ...prev,
      label_ids: prev.label_ids.includes(labelId)
        ? prev.label_ids.filter(id => id !== labelId)
        : [...prev.label_ids, labelId]
    }));
  };

  const toggleRecipientType = (type) => {
    setFormData(prev => ({
      ...prev,
      recipient_types: prev.recipient_types.includes(type)
        ? prev.recipient_types.filter(t => t !== type)
        : [...prev.recipient_types, type]
    }));
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-3xl bg-white rounded-xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-neutral-200">
            <DialogTitle className="text-xl font-semibold text-neutral-900">
              {reminder ? 'Edit Reminder' : 'Add Reminder'}
            </DialogTitle>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-500 transition-colors"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                placeholder="e.g., Client 48 Hour Reminder"
              />
            </div>

            {/* Enabled */}
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => setFormData(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
                />
                <span className="text-sm font-medium text-neutral-700">Enabled</span>
              </label>
              <p className="mt-1 text-xs text-neutral-500">
                Whether or not reminders are sent
              </p>
            </div>

            {/* Labels */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Labels
              </label>
              <p className="text-xs text-neutral-500 mb-3">
                Select Labels to choose which jobs to send reminders for. If no Labels are selected then all jobs will have reminders sent for them.
              </p>
              <div className="max-h-48 overflow-y-auto border border-neutral-200 rounded-lg p-3 space-y-2">
                {labels.length === 0 ? (
                  <p className="text-sm text-neutral-500">No labels available</p>
                ) : (
                  labels.map((label) => (
                    <label key={label.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.label_ids.includes(label.id)}
                        onChange={() => toggleLabel(label.id)}
                        className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
                      />
                      <span className="text-sm text-neutral-700">{label.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Recipient Types */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Recipient Types
              </label>
              <p className="text-xs text-neutral-500 mb-3">
                Select the Role Types you would like to receive a reminder email.
              </p>
              <div className="space-y-2">
                {['administrator', 'tutor', 'client', 'student'].map((type) => (
                  <label key={type} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.recipient_types.includes(type)}
                      onChange={() => toggleRecipientType(type)}
                      className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
                    />
                    <span className="text-sm text-neutral-700 capitalize">{type}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Send to Associated Clients */}
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.send_to_associated_clients}
                  onChange={(e) => setFormData(prev => ({ ...prev, send_to_associated_clients: e.target.checked }))}
                  className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
                />
                <span className="text-sm font-medium text-neutral-700">Send to Associated Clients</span>
              </label>
              <p className="mt-1 text-xs text-neutral-500">
                Select if you wish associated clients to receive a reminder email. (Separate to paying Client)
              </p>
            </div>

            {/* Delivery Time Offset */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Delivery time offset
              </label>
              <input
                type="text"
                value={formData.delivery_time_offset}
                onChange={(e) => setFormData(prev => ({ ...prev, delivery_time_offset: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                placeholder="e.g., 48 hours before"
              />
              <p className="mt-1 text-xs text-neutral-500">
                How long before lesson reminders should be sent
              </p>
            </div>

            {/* Submit Button */}
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
                {loading ? 'Saving...' : (reminder ? 'Update' : 'Create')}
              </button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

