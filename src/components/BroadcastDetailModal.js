import React, { useState, useEffect } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useToast } from '../hooks/useToast';
import ConfirmationModal from './ConfirmationModal';

export default function BroadcastDetailModal({ open, onClose, broadcast, onEdit, onDelete }) {
  const [broadcastData, setBroadcastData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (open && broadcast?.id) {
      fetchBroadcastDetails();
    }
  }, [open, broadcast]);

  const fetchBroadcastDetails = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/broadcasts/${broadcast.id}`);
      if (response.ok) {
        const data = await response.json();
        setBroadcastData(data.broadcast);
      }
    } catch (error) {
      console.error('Error fetching broadcast details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendPreview = async () => {
    try {
      const response = await fetch(`/api/broadcasts/${broadcast.id}/send-preview`, {
        method: 'POST'
      });
      if (response.ok) {
        toast.success('Preview email sent successfully!');
      } else {
        toast.error('Failed to send preview email');
      }
    } catch (error) {
      console.error('Error sending preview:', error);
      toast.error('Error sending preview email');
    }
  };

  const handleSend = async () => {
    try {
      const response = await fetch(`/api/broadcasts/${broadcast.id}/send`, {
        method: 'POST'
      });
      if (response.ok) {
        toast.success('Broadcast sent successfully!');
        setSendConfirmOpen(false);
        fetchBroadcastDetails();
      } else {
        const errorData = await response.json();
        toast.error(`Failed to send broadcast: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error sending broadcast:', error);
      toast.error('Error sending broadcast');
    }
  };

  const handleDelete = async () => {
    try {
      const response = await fetch(`/api/broadcasts/${broadcast.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setDeleteConfirmOpen(false);
        onDelete();
      } else {
        const errorData = await response.json();
        toast.error(`Failed to delete broadcast: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error deleting broadcast:', error);
      toast.error('Error deleting broadcast');
    }
  };

  if (!broadcast) return null;

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="mx-auto max-w-4xl w-full bg-white rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-6 border-b border-neutral-200 sticky top-0 bg-white z-10">
            <DialogTitle className="text-lg font-semibold text-neutral-900">
              Broadcast Details
            </DialogTitle>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-500"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
              <p className="mt-4 text-sm text-neutral-600">Loading...</p>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => onEdit(broadcast)}
                  className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={handleSendPreview}
                  className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
                >
                  Send Preview
                </button>
                <button
                  onClick={() => setSendConfirmOpen(true)}
                  className="px-4 py-2 text-sm font-medium text-white bg-brand-purple rounded-lg hover:bg-brand-navy transition-colors"
                >
                  Send
                </button>
              </div>

              {/* Broadcast Details */}
              <div>
                <h3 className="text-sm font-medium text-neutral-500 mb-2">Broadcast Details</h3>
                <div className="space-y-1 text-sm text-neutral-900">
                  <p>Date Created: {broadcastData?.date_created 
                    ? new Date(broadcastData.date_created).toLocaleDateString('en-US', {
                        month: '2-digit',
                        day: '2-digit',
                        year: 'numeric'
                      })
                    : '—'}</p>
                  <p>Last Sent: {broadcastData?.last_sent
                    ? new Date(broadcastData.last_sent).toLocaleString('en-US', {
                        month: '2-digit',
                        day: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                      })
                    : 'Never'}</p>
                </div>
              </div>

              {/* Broadcast Preview */}
              <div>
                <h3 className="text-sm font-medium text-neutral-500 mb-3">Broadcast Preview</h3>
                <div className="bg-white border border-neutral-200 rounded-lg p-6">
                  <div className="mb-4">
                    <strong className="text-neutral-900">Subject:</strong> {broadcastData?.subject || broadcast.subject}
                  </div>
                  <div className="prose max-w-none">
                    <div className="whitespace-pre-wrap text-sm text-neutral-700">
                      {broadcastData?.email_body || broadcast.email_body || 'No content'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Broadcast History */}
              {broadcastData?.history && broadcastData.history.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-neutral-500 mb-3">Broadcast History</h3>
                  <div className="space-y-3">
                    {broadcastData.history.map((entry, index) => (
                      <div key={index} className="border-b border-neutral-200 pb-3 last:border-b-0">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-sm text-neutral-900">{entry.description}</p>
                            {entry.label_filter && (
                              <p className="text-xs text-neutral-500 mt-1">
                                Label Filter: {entry.label_filter}
                              </p>
                            )}
                          </div>
                          <p className="text-xs text-neutral-500">
                            {new Date(entry.timestamp).toLocaleString('en-US', {
                              month: '2-digit',
                              day: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogPanel>
      </div>

      <ConfirmationModal
        isOpen={sendConfirmOpen}
        onClose={() => setSendConfirmOpen(false)}
        onConfirm={handleSend}
        title="Send Broadcast"
        message={`Are you sure you want to send this broadcast to ${broadcastData?.recipient_count || 0} recipients?`}
        confirmText="Send"
      />

      <ConfirmationModal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Delete Broadcast"
        message="Are you sure you want to delete this broadcast? This action cannot be undone."
        confirmText="Delete"
        isDestructive={true}
      />
    </Dialog>
  );
}

