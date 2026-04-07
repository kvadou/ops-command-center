import React, { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon, PaperClipIcon } from '@heroicons/react/24/outline';

export default function OutboundEmailDetailModal({ isOpen, onClose, email }) {
  const [emailDetails, setEmailDetails] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && email?.id) {
      fetchEmailDetails();
    }
  }, [isOpen, email?.id]);

  const fetchEmailDetails = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/outbound-emails/${email.id}`);
      if (!response.ok) throw new Error('Failed to fetch email details');
      const data = await response.json();
      setEmailDetails(data);
    } catch (error) {
      console.error('Error fetching email details:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      return dateString;
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'opened':
        return 'text-green-600';
      case 'sent':
        return 'text-blue-600';
      case 'pending':
        return 'text-yellow-600';
      case 'bounced':
        return 'text-red-600';
      default:
        return 'text-neutral-600';
    }
  };

  const emailData = emailDetails || email;

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-4xl bg-white rounded-xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-neutral-200">
            <DialogTitle className="text-xl font-semibold text-neutral-900">
              Email Details
            </DialogTitle>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-500 transition-colors"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple"></div>
            </div>
          ) : emailData ? (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Email Summary */}
              <div className="bg-neutral-50 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-neutral-500 uppercase">To</label>
                    <p className="text-sm text-neutral-900 mt-1">
                      {emailData.client_name ? `${emailData.client_name} <${emailData.client_email}>` : emailData.client_email}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-neutral-500 uppercase">Subject</label>
                    <p className="text-sm text-neutral-900 mt-1">{emailData.email_subject || 'No subject'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-neutral-500 uppercase">Send Time</label>
                    <p className="text-sm text-neutral-900 mt-1">
                      {formatDateTime(emailData.sent_at || emailData.date_sent)}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-neutral-500 uppercase">Status</label>
                    <p className={`text-sm font-medium mt-1 ${getStatusColor(emailData.email_opened_at ? 'Opened' : emailData.status)}`}>
                      {emailData.email_opened_at ? 'Opened' : (emailData.status || 'Sent')}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-neutral-500 uppercase">Last Updated</label>
                    <p className="text-sm text-neutral-900 mt-1">
                      {formatDateTime(emailData.sent_at || emailData.date_sent)}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-neutral-500 uppercase">Cost</label>
                    <p className="text-sm text-neutral-900 mt-1">$0.000</p>
                  </div>
                </div>
              </div>

              {/* Email Body */}
              <div className="bg-white border border-neutral-200 rounded-lg p-6">
                <div className="mb-4">
                  <img src="/logo512.png" alt="Acme Operations" className="h-12 w-auto" />
                </div>
                <div 
                  className="prose max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(emailData.email_body || emailData.tutor_feedback || 'No email body available')
                  }}
                />
              </div>

              {/* Events */}
              <div className="bg-neutral-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-neutral-900 mb-3">Events</h3>
                {emailData.email_opened_at || emailData.email_clicked_at ? (
                  <div className="space-y-2">
                    {emailData.email_opened_at && (
                      <div className="text-sm text-neutral-700">
                        <span className="font-medium">Opened:</span> {formatDateTime(emailData.email_opened_at)}
                        {emailData.email_opened_count > 1 && (
                          <span className="text-neutral-500 ml-2">({emailData.email_opened_count} times)</span>
                        )}
                      </div>
                    )}
                    {emailData.email_clicked_at && (
                      <div className="text-sm text-neutral-700">
                        <span className="font-medium">Clicked:</span> {formatDateTime(emailData.email_clicked_at)}
                        {emailData.email_clicked_count > 1 && (
                          <span className="text-neutral-500 ml-2">({emailData.email_clicked_count} times)</span>
                        )}
                      </div>
                    )}
                    {emailData.email_delivered_at && (
                      <div className="text-sm text-neutral-700">
                        <span className="font-medium">Delivered:</span> {formatDateTime(emailData.email_delivered_at)}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-500">There have been no events for this message.</p>
                )}
              </div>

              {/* Attachments */}
              {emailData.attachments && emailData.attachments.length > 0 && (
                <div className="bg-neutral-50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-neutral-900 mb-3">Attachments</h3>
                  <div className="space-y-2">
                    {emailData.attachments.map((attachment, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm text-neutral-700">
                        <PaperClipIcon className="h-4 w-4 text-neutral-400" />
                        <span>{attachment}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 text-center text-neutral-500">
              <p>No email details available</p>
            </div>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
}

