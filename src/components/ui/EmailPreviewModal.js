import React, { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { XMarkIcon } from '@heroicons/react/24/outline';

/**
 * Email Preview Modal component
 * 
 * @param {boolean} isOpen
 * @param {function} onClose
 * @param {object} email - Email data with to, subject, content, etc.
 */
export default function EmailPreviewModal({ isOpen, onClose, email }) {
  const [emailContent, setEmailContent] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && email) {
      // Check if we already have content
      const existingContent = email.email_content || email.email_body || email.html_content;
      
      if (existingContent) {
        setEmailContent(existingContent);
        setLoading(false);
      } else if (email.id) {
        // Try to fetch email content if not already available
        setLoading(true);
        fetch(`/api/entity-details/communications/${email.id}`)
          .then(res => {
            if (!res.ok) {
              throw new Error('Failed to fetch email content');
            }
            return res.json();
          })
          .then(data => {
            setEmailContent(data.email_content || data.email_body || data.html_content || data.tutor_feedback || null);
            setLoading(false);
          })
          .catch(err => {
            console.error('Error fetching email content:', err);
            setEmailContent(null);
            setLoading(false);
          });
      } else {
        setEmailContent(null);
        setLoading(false);
      }
    }
  }, [isOpen, email]);

  if (!isOpen || !email) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-neutral-500 bg-opacity-75 transition-opacity"
        onClick={onClose}
      ></div>

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="bg-primary-500 px-6 py-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Email Preview</h3>
            <button
              onClick={onClose}
              className="text-white hover:text-neutral-200 transition-colors"
              aria-label="Close"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
            <div className="space-y-4">
              {/* Email Headers */}
              <div className="border-b border-neutral-200 pb-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="font-medium text-neutral-600 mb-1">To:</div>
                    <div className="text-primary-900">{email.to || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="font-medium text-neutral-600 mb-1">Subject:</div>
                    <div className="text-primary-900">{email.subject || 'No subject'}</div>
                  </div>
                  <div>
                    <div className="font-medium text-neutral-600 mb-1">Sent:</div>
                    <div className="text-primary-900">
                      {email.send_time || email.sent_at 
                        ? new Date(email.send_time || email.sent_at).toLocaleString()
                        : 'Unknown'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Email Body */}
              <div className="border border-neutral-200 rounded-lg p-4 bg-neutral-50 min-h-[200px]">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
                    <span className="ml-3 text-neutral-600">Loading email content...</span>
                  </div>
                ) : emailContent || email.email_content || email.email_body || email.content || email.html_content ? (
                  <div 
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(emailContent || email.email_content || email.email_body || email.content || email.html_content)
                    }}
                  />
                ) : (
                  <div className="text-neutral-600 italic py-8">
                    <p>Email content not available in the database.</p>
                    <p className="mt-2">This email was sent via TutorCruncher.</p>
                    {email.url && (
                      <div className="mt-4">
                        <a 
                          href={email.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:text-primary-700 underline inline-flex items-center gap-1"
                        >
                          View in TutorCruncher
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-neutral-50 px-6 py-4 border-t border-neutral-200 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}














