import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ConfirmationModal from '../ConfirmationModal';
import { useToast } from '../../hooks/useToast';
import { RoleProvider } from '../../contexts/RoleContext';
import { BranchProvider } from '../../contexts/BranchContext';
import { formatCurrency } from '../../utils/formatters';
import {
  DocumentArrowDownIcon,
  EnvelopeIcon,
  XMarkIcon,
  CreditCardIcon,
  CalendarIcon,
  UserIcon,
  DocumentTextIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set up PDF.js worker - use CDN version that matches react-pdf's bundled pdfjs-dist
// react-pdf@10.2.0 bundles pdfjs-dist@5.4.296, so we use that exact version's worker
// Using CDN avoids Vite optimization issues with worker file imports
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.4.296/build/pdf.worker.min.mjs`;

function InvoiceDetailView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [activities, setActivities] = useState([]);
  const [balanceUpdates, setBalanceUpdates] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfError, setPdfError] = useState(null);
  const [pdfBlob, setPdfBlob] = useState(null); // Store blob for downloads
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '', isDestructive: false });

  useEffect(() => {
    fetchInvoice();
  }, [id]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfUrl && pdfUrl.startsWith('blob:')) {
        window.URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  const fetchInvoice = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/accounting/invoices/${id}`, {
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to fetch invoice');

      const data = await response.json();
      setInvoice(data.invoice);
      setItems(data.items || []);
      setActivities(data.activities || []);
      setBalanceUpdates(data.balanceUpdates || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };


  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const handleViewPDF = async () => {
    try {
      setPdfError(null);
      setShowPdfModal(true);
      
      const response = await fetch(`/api/accounting/invoices/${id}/pdf`, {
        credentials: 'include',
      });

      if (!response.ok) {
        let errorMessage = `Failed to generate PDF (HTTP ${response.status})`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.details || errorData.error || errorMessage;
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/pdf')) {
        throw new Error('Invalid PDF response from server');
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error('PDF file is empty (0 bytes)');
      }

      // Store blob for downloads
      setPdfBlob(blob);
      
      // Create blob URL for react-pdf (works reliably across all browsers)
      const url = window.URL.createObjectURL(blob);
      setPdfUrl(url);
      setPdfError(null);
      setPdfLoading(true);
    } catch (err) {
      console.error('PDF generation error:', err);
      setPdfError(err.message || 'Failed to load PDF document.');
      setPdfUrl(null);
    }
  };

  const handleDownloadPDF = () => {
    if (pdfBlob) {
      // Use stored blob for download (works for both Chrome and other browsers)
      const url = window.URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice_${invoice?.invoice_number || id}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);
    } else if (pdfUrl) {
      // Fallback: use pdfUrl directly
      const a = document.createElement('a');
      a.href = pdfUrl;
      a.download = `Invoice_${invoice?.invoice_number || id}.pdf`;
      document.body.appendChild(a);
      a.click();
      if (pdfUrl.startsWith('blob:')) {
        setTimeout(() => window.URL.revokeObjectURL(pdfUrl), 100);
      }
      document.body.removeChild(a);
    }
  };

  const handleSendEmail = async () => {
    try {
      setSendingEmail(true);
      const response = await fetch(`/api/accounting/invoices/${id}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ forceSend: true }),
      });

      if (!response.ok) throw new Error('Failed to send email');

      const data = await response.json();
      toast.success('Invoice email sent successfully!');
      fetchInvoice(); // Refresh to update email_sent_at
    } catch (err) {
      toast.error(`Error sending email: ${err.message}`);
    } finally {
      setSendingEmail(false);
    }
  };

  const handlePayInvoice = async () => {
    try {
      setProcessingPayment(true);
      const response = await fetch(`/api/accounting/invoices/${id}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error('Failed to create payment session');

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.success('Payment processed successfully!');
        fetchInvoice();
      }
    } catch (err) {
      toast.error(`Error processing payment: ${err.message}`);
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleCancelInvoice = () => {
    setConfirmState({
      isOpen: true,
      title: 'Cancel Invoice',
      message: 'Are you sure you want to cancel this invoice? A credit request will be created.',
      isDestructive: true,
      action: async () => {
        try {
          const response = await fetch(`/api/accounting/invoices/${id}/cancel`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
              reason: 'Invoice cancellation',
            }),
          });

          if (!response.ok) throw new Error('Failed to cancel invoice');

          const data = await response.json();
          toast.success(`Invoice cancelled. Credit request ${data.credit_request.credit_request_number} created.`);
          navigate(`/accounting/draft-credit-requests`);
        } catch (err) {
          toast.error(`Error cancelling invoice: ${err.message}`);
        }
      },
    });
  };

  const handleCancelPendingPayment = () => {
    setConfirmState({
      isOpen: true,
      title: 'Cancel Pending Payment',
      message: 'Are you sure you want to cancel the pending payment for this invoice?',
      isDestructive: true,
      action: async () => {
        try {
          const response = await fetch(`/api/accounting/invoices/${id}/cancel-payment`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
          });

          if (!response.ok) throw new Error('Failed to cancel pending payment');

          toast.success('Pending payment cancelled successfully.');
          fetchInvoice();
        } catch (err) {
          toast.error(`Error cancelling pending payment: ${err.message}`);
        }
      },
    });
  };

  const getStatusBadge = (status) => {
    const badges = {
      draft: 'bg-neutral-100 text-neutral-800',
      raised: 'bg-blue-100 text-blue-800',
      pending: 'bg-yellow-100 text-yellow-800',
      paid: 'bg-green-100 text-green-800',
      overdue: 'bg-red-100 text-red-800',
      cancelled: 'bg-neutral-100 text-neutral-800',
    };
    return (
      <span className={`px-3 py-1 inline-flex text-sm font-semibold rounded-full ${badges[status] || badges.draft}`}>
        {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Draft'}
      </span>
    );
  };

  const formatActivityAction = (action) => {
    const actionMap = {
      invoice_created: 'Created an Invoice',
      invoice_raised: 'Raised an Invoice',
      invoice_paid: 'Marked an Invoice as paid',
      invoice_cancelled: 'Cancelled an Invoice',
      payment_received: 'Received Payment',
      payment_processed: 'Processed Payment',
      deferred_payment_created: 'Created a deferred payment',
      email_sent: 'Sent Invoice Email',
    };
    return actionMap[action] || action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
        <p className="mt-4 text-neutral-600">Loading invoice...</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div className="text-red-600">{error || 'Invoice not found'}</div>
      </div>
    );
  }

  const invoiceAmount = parseFloat(invoice.gross) || 0;
  const affiliateAmount = parseFloat(invoice.affiliate_amount) || 0;
  const tutorAmount = parseFloat(invoice.tutor_amount) || 0;
  const branchTax = parseFloat(invoice.branch_tax) || 0;
  const branchNetAmount = parseFloat(invoice.branch_net_amount) || 0;
  const tax = parseFloat(invoice.tax) || 0;
  const total = invoiceAmount;

  // Format date for display
  const formatDisplayDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  // Format date with time
  const formatDisplayDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const dateStr = date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
    const timeStr = date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    return `${dateStr} — ${timeStr}`;
  };

  // Build client address
  const clientAddressLines = [];
  if (invoice.client_street) clientAddressLines.push(invoice.client_street);
  if (invoice.client_town || invoice.client_state || invoice.client_postcode) {
    const cityStateZip = [
      invoice.client_town,
      invoice.client_state ? `${invoice.client_state} ${invoice.client_postcode || ''}`.trim() : invoice.client_postcode
    ].filter(Boolean).join(', ');
    if (cityStateZip) clientAddressLines.push(cityStateZip);
  }
  if (invoice.client_country) clientAddressLines.push(invoice.client_country);

  return (
    <div className="w-full">
      {/* Action Bar */}
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <button
          onClick={() => navigate('/accounting/raised-invoices')}
          className="text-sm text-neutral-600 hover:text-neutral-900 flex items-center gap-2 font-medium"
        >
          ← Back to Invoices
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleViewPDF}
            className="px-4 py-2 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 flex items-center gap-2 text-sm font-medium text-neutral-700 shadow-sm transition-all"
          >
            <DocumentArrowDownIcon className="h-5 w-5" />
            View Invoice PDF
          </button>
          {(invoice.status === 'pending' && invoice.deferred_payment_date) && (
            <button
              onClick={handleCancelPendingPayment}
              className="px-4 py-2 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 flex items-center gap-2 text-sm font-medium text-neutral-700 shadow-sm transition-all"
            >
              <XCircleIcon className="h-5 w-5" />
              Cancel Pending Payment
            </button>
          )}
          {(invoice.status === 'pending' || invoice.status === 'unpaid' || invoice.status === 'raised') && (
            <button
              onClick={handleCancelInvoice}
              className="px-4 py-2 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 flex items-center gap-2 text-sm font-medium text-neutral-700 shadow-sm transition-all"
            >
              <ExclamationTriangleIcon className="h-5 w-5" />
              Cancel Invoice/Issue Credit Note
            </button>
          )}
          {(invoice.status === 'pending' || invoice.status === 'unpaid' || invoice.status === 'raised') && (
            <button
              onClick={handlePayInvoice}
              disabled={processingPayment}
              className="px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-primary-700 flex items-center gap-2 text-sm font-medium disabled:opacity-50 transition-all shadow-sm"
            >
              <CreditCardIcon className="h-5 w-5" />
              {processingPayment ? 'Processing...' : 'Pay Invoice'}
            </button>
          )}
        </div>
      </div>

        {/* Invoice Details Box */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 mb-6">
          <div className="flex flex-col md:flex-row items-start justify-between gap-4">
            {/* Left side - Invoice to */}
            <div className="text-lg font-semibold text-neutral-900">
              Invoice to {invoice.client_first_name} {invoice.client_last_name}
            </div>
            
            {/* Right side - Details */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-neutral-600 min-w-[120px]">Status:</span>
                <div>{getStatusBadge(invoice.status)}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-neutral-600 min-w-[120px]">Invoice Number:</span>
                <span className="text-sm font-medium text-neutral-900">{invoice.invoice_number || invoice.display_id || `INV-${invoice.id}`}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-neutral-600 min-w-[120px]">Date Created:</span>
                <span className="text-sm font-medium text-neutral-900">{formatDisplayDate(invoice.date_created || invoice.fetched_at)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-neutral-600 min-w-[120px]">Date Sent:</span>
                <span className="text-sm font-medium text-neutral-900">{invoice.date_sent ? formatDisplayDate(invoice.date_sent) : 'N/A'}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-neutral-600 min-w-[120px]">Client:</span>
                {invoice.client_id ? (
                  <Link
                    to={`/clients/${invoice.client_id}`}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {invoice.client_first_name} {invoice.client_last_name}
                  </Link>
                ) : (
                  <span className="text-sm font-medium text-neutral-900">{invoice.client_first_name} {invoice.client_last_name}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Invoice Container */}
        <div className="bg-white rounded-xl shadow-lg border border-neutral-200 overflow-hidden mb-6">
          {/* Lessons Section */}
          <div className="px-8 py-6">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Lessons</h3>
            {items.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-brand-purple">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">Topic</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">Start</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">Finish</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">Units</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-white uppercase tracking-wider">Tax</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-white uppercase tracking-wider">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {items.map((item, idx) => {
                        const startTime = item.appointment_start ? formatDisplayDateTime(item.appointment_start) : (item.item_date ? formatDisplayDateTime(item.item_date) : 'N/A');
                        const finishTime = item.appointment_finish ? formatDisplayDateTime(item.appointment_finish) : 'N/A';
                        const topic = item.appointment_topic || item.description || item.service_name || 'Lesson';
                        const itemTax = parseFloat(item.tax_amount) || 0;
                        const units = item.units || 1;
                        
                        return (
                          <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                            <td className="px-4 py-4">
                              {item.appointment_id ? (
                                <Link
                                  to={`/lessons/${item.appointment_id}`}
                                  className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                  {topic}
                                </Link>
                              ) : (
                                <div className="text-sm font-medium text-neutral-900">{topic}</div>
                              )}
                              {item.student_names && item.student_names.length > 0 && (
                                <div className="text-xs text-neutral-500 mt-1">Students: {item.student_names.join(', ')}</div>
                              )}
                              {item.tutor_name && (
                                <div className="text-xs text-neutral-500 mt-1">Tutor: {item.tutor_name}</div>
                              )}
                            </td>
                            <td className="px-4 py-4 text-sm text-neutral-600 whitespace-nowrap">{startTime}</td>
                            <td className="px-4 py-4 text-sm text-neutral-600 whitespace-nowrap">{finishTime}</td>
                            <td className="px-4 py-4 text-sm text-neutral-600">{units}</td>
                            <td className="px-4 py-4 text-sm text-neutral-600 text-right">{formatCurrency(itemTax)}</td>
                            <td className="px-4 py-4 text-sm font-semibold text-neutral-900 text-right">{formatCurrency(item.amount)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Summary of Amounts */}
                <div className="mt-6 flex justify-end">
                  <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-5 w-96">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-neutral-600 font-medium">Affiliate Amount:</span>
                        <span className="text-neutral-900 font-semibold">{formatCurrency(affiliateAmount)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-neutral-600 font-medium">Tutor Amount:</span>
                        <span className="text-neutral-900 font-semibold">{formatCurrency(tutorAmount)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-neutral-600 font-medium">Branch Tax:</span>
                        <span className="text-neutral-900 font-semibold">{formatCurrency(branchTax)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-neutral-600 font-medium">Branch Net Amount:</span>
                        <span className="text-neutral-900 font-semibold">{formatCurrency(branchNetAmount)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-3 mt-3 border-t-2 border-brand-purple">
                        <span className="text-brand-purple font-bold text-base">Invoice Amount:</span>
                        <span className="text-brand-purple font-bold text-xl">{formatCurrency(invoiceAmount)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-neutral-500 text-center py-8">No lessons found</p>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-neutral-200 px-8 py-6 bg-neutral-50">
            <div className="text-center">
              <div className="text-sm font-medium text-neutral-700 mb-1">Thank you for choosing Acme Operations!</div>
              <div className="text-xs text-neutral-500">
                Questions? Email <a href="mailto:support@acmeops.com" className="text-brand-purple font-medium hover:underline">support@acmeops.com</a>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Details Sections */}
        <div className="mt-6 space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Balance Updates</h2>
        {balanceUpdates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Method</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase">Credit Amount</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase">Allocated Credit</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-neutral-200">
                {balanceUpdates.map((update, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-3 text-sm text-neutral-500">{formatDate(update.created_at)}</td>
                    <td className="px-4 py-3 text-sm text-neutral-900">{update.update_type || 'Balance Update'}</td>
                    <td className="px-4 py-3 text-sm text-neutral-500">{update.method || 'System Generated'}</td>
                    <td className="px-4 py-3 text-sm text-neutral-500">{update.description || '—'}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-neutral-900">
                      {formatCurrency(update.change_amount || 0)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-neutral-500">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No Balance Updates</p>
        )}
      </div>

          {/* Payment Events Section */}
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Payment Events</h2>
        {activities.filter(a => a.action === 'payment_received' || a.action === 'payment_processed' || a.action === 'invoice_paid').length > 0 ? (
          <div className="space-y-3">
            {activities
              .filter(a => a.action === 'payment_received' || a.action === 'payment_processed' || a.action === 'invoice_paid')
              .map((activity, idx) => (
                <div key={idx} className="flex items-start justify-between pb-3 border-b border-neutral-100 last:border-0">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-900">Payment Received</p>
                    <p className="text-xs text-neutral-500 mt-1">
                      {formatDateTime(activity.created_at)}
                      {activity.performed_by_name && ` by ${activity.performed_by_name}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-green-600">{formatCurrency(invoiceAmount)}</p>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No Payment Events</p>
        )}
      </div>

      {/* Activity Feed Section */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-neutral-900">Activity Feed</h2>
          {activities.length > 5 && (
            <button className="text-sm text-blue-600 hover:text-blue-800">more</button>
          )}
        </div>
        {activities.length > 0 ? (
          <div className="space-y-3">
            {activities.slice(0, 10).map((activity, idx) => (
              <div key={idx} className="flex items-start gap-3 pb-3 border-b border-neutral-100 last:border-0">
                <div className="flex-1">
                  <p className="text-sm font-medium text-neutral-900">
                    {activity.performed_by_name ? (
                      <Link to={`/home/users/${activity.performed_by}`} className="text-blue-600 hover:text-blue-800">
                        {activity.performed_by_name}
                      </Link>
                    ) : (
                      'System'
                    )}{' '}
                    • {formatActivityAction(activity.action)}
                  </p>
                  {activity.details && (
                    <p className="text-xs text-neutral-500 mt-1">{activity.details}</p>
                  )}
                  <p className="text-xs text-neutral-500 mt-1">{formatDateTime(activity.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No activity</p>
        )}
      </div>
        </div>

      {/* PDF Modal Overlay - Professional Design */}
      {showPdfModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[95vh] flex flex-col border border-neutral-200">
            {/* Header - Premium Styling */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 bg-gradient-to-r from-brand-purple/5 to-white">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-brand-purple/10 flex items-center justify-center">
                  <DocumentTextIcon className="h-6 w-6 text-brand-purple" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-neutral-900">
                    Invoice {invoice.invoice_number || `INV-${invoice.id}`}
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">PDF Preview</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {pdfUrl && !pdfError && (
                  <button
                    onClick={handleDownloadPDF}
                    className="px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy flex items-center gap-2 text-sm font-medium shadow-sm transition-all"
                  >
                    <DocumentArrowDownIcon className="h-5 w-5" />
                    Download
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowPdfModal(false);
                    setPdfError(null);
                    if (pdfUrl && pdfUrl.startsWith('blob:')) {
                      window.URL.revokeObjectURL(pdfUrl);
                    }
                    setPdfUrl(null);
                    setPdfBlob(null);
                    setNumPages(null);
                    setPageNumber(1);
                    setPdfLoading(false);
                  }}
                  className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
                  aria-label="Close"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
            </div>
            
            {/* PDF Content Area */}
            <div className="flex-1 overflow-auto p-6 bg-gradient-to-br from-neutral-50 to-white">
              {pdfError ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[600px] text-center">
                  <div className="bg-red-50 border-2 border-red-200 rounded-xl p-8 max-w-lg shadow-sm">
                    <div className="h-16 w-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <XMarkIcon className="h-8 w-8 text-red-600" />
                    </div>
                    <h4 className="text-xl font-semibold text-red-900 mb-3">Error Loading PDF</h4>
                    <p className="text-sm text-red-700 mb-4 break-words">{pdfError}</p>
                    <p className="text-xs text-red-600 mb-6">
                      Check the browser console (F12) for more details.
                    </p>
                    <div className="flex gap-3 justify-center">
                      <button
                        onClick={handleViewPDF}
                        className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium shadow-sm transition-all"
                      >
                        Retry
                      </button>
                      <button
                        onClick={() => {
                          window.open(`/api/accounting/invoices/${id}/pdf`, '_blank');
                        }}
                        className="px-5 py-2.5 bg-neutral-600 text-white rounded-lg hover:bg-neutral-700 text-sm font-medium shadow-sm transition-all"
                      >
                        Download Instead
                      </button>
                    </div>
                  </div>
                </div>
              ) : pdfUrl ? (
                <div className="w-full h-full min-h-[600px] flex flex-col">
                  {/* PDF Viewer Container */}
                  <div className="flex-1 relative bg-neutral-100 rounded-lg overflow-auto flex items-center justify-center border border-neutral-200 shadow-inner">
                    {pdfLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/95 backdrop-blur-sm z-10 rounded-lg">
                        <div className="text-center">
                          <div className="animate-spin rounded-full h-14 w-14 border-4 border-brand-purple/20 border-t-brand-purple mx-auto mb-4"></div>
                          <p className="text-sm font-medium text-neutral-700">Loading PDF...</p>
                          <p className="text-xs text-neutral-500 mt-1">Please wait</p>
                        </div>
                      </div>
                    )}
                    <div className="w-full flex flex-col items-center p-6">
                      <Document
                        file={pdfUrl}
                        onLoadSuccess={({ numPages }) => {
                          setNumPages(numPages);
                          setPdfLoading(false);
                        }}
                        onLoadError={(error) => {
                          console.error('PDF load error:', error);
                          setPdfError('Failed to load PDF document. Please try downloading instead.');
                          setPdfLoading(false);
                        }}
                        loading={
                          <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-14 w-14 border-4 border-brand-purple/20 border-t-brand-purple mx-auto mb-4"></div>
                            <p className="text-sm font-medium text-neutral-700">Loading PDF...</p>
                          </div>
                        }
                        className="flex flex-col items-center"
                      >
                        {numPages && numPages > 1 && (
                          <div className="mb-6 flex items-center gap-4 bg-white px-4 py-2.5 rounded-lg shadow-sm border border-neutral-200">
                            <button
                              onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
                              disabled={pageNumber <= 1}
                              className="px-4 py-1.5 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-all"
                            >
                              ← Previous
                            </button>
                            <span className="text-sm font-medium text-neutral-700 px-4">
                              Page {pageNumber} of {numPages}
                            </span>
                            <button
                              onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))}
                              disabled={pageNumber >= numPages}
                              className="px-4 py-1.5 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-all"
                            >
                              Next →
                            </button>
                          </div>
                        )}
                        <div className="bg-white rounded-lg shadow-xl p-2">
                          <Page
                            pageNumber={pageNumber}
                            renderTextLayer={true}
                            renderAnnotationLayer={true}
                            className="shadow-lg"
                            width={Math.min(850, window.innerWidth - 120)}
                          />
                        </div>
                      </Document>
                    </div>
                  </div>
                  
                  {/* Action Buttons - Enhanced */}
                  <div className="mt-6 flex items-center justify-center gap-3 pt-4 border-t border-neutral-200">
                    <button
                      onClick={handleDownloadPDF}
                      className="px-5 py-2.5 bg-brand-purple text-white rounded-lg hover:bg-brand-navy font-medium flex items-center gap-2 shadow-sm transition-all"
                    >
                      <DocumentArrowDownIcon className="h-5 w-5" />
                      Download PDF
                    </button>
                    <button
                      onClick={() => {
                        const url = `/api/accounting/invoices/${id}/pdf`;
                        fetch(url, {
                          credentials: 'include',
                        })
                          .then(response => {
                            if (!response.ok) throw new Error('Failed to fetch PDF');
                            return response.blob();
                          })
                          .then(blob => {
                            const blobUrl = window.URL.createObjectURL(blob);
                            const newWindow = window.open(blobUrl, '_blank');
                            if (!newWindow) {
                              toast.warn('Please allow pop-ups for this site to view PDFs in a new tab.');
                            } else {
                              setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10000);
                            }
                          })
                          .catch(err => {
                            console.error('Failed to open PDF in new tab:', err);
                            toast.error('Failed to open PDF. Please try downloading instead.');
                          });
                      }}
                      className="px-5 py-2.5 bg-white border-2 border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 hover:border-neutral-400 font-medium transition-all shadow-sm"
                    >
                      Open in New Tab
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full min-h-[600px]">
                  <div className="animate-spin rounded-full h-14 w-14 border-4 border-brand-purple/20 border-t-brand-purple mb-4"></div>
                  <p className="text-sm font-medium text-neutral-700">Generating PDF...</p>
                  <p className="text-xs text-neutral-500 mt-1">This may take a moment</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState({ ...confirmState, isOpen: false })}
        onConfirm={async () => {
          setConfirmState({ ...confirmState, isOpen: false });
          if (confirmState.action) await confirmState.action();
        }}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.isDestructive ? 'Yes, Cancel' : 'Confirm'}
        isDestructive={confirmState.isDestructive}
      />
    </div>
  );
}

export default function InvoiceDetailViewWrapper() {
  return (
    <RoleProvider>
      <BranchProvider>
        <InvoiceDetailView />
      </BranchProvider>
    </RoleProvider>
  );
}
