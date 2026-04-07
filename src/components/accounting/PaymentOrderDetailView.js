import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ConfirmationModal from '../ConfirmationModal';
import { useToast } from '../../hooks/useToast';
import { RoleProvider } from '../../contexts/RoleContext';
import { BranchProvider } from '../../contexts/BranchContext';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import {
  DocumentArrowDownIcon,
  EnvelopeIcon,
  XMarkIcon,
  UserIcon,
  DocumentTextIcon,
  ArrowUpIcon,
  QueueListIcon,
  BanknotesIcon,
  NoSymbolIcon,
} from '@heroicons/react/24/outline';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set up PDF.js worker - use CDN version that matches react-pdf's bundled pdfjs-dist
// react-pdf@10.2.0 bundles pdfjs-dist@5.4.296, so we use that exact version's worker
// Using CDN avoids Vite optimization issues with worker file imports
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.4.296/build/pdf.worker.min.mjs`;

function PaymentOrderDetailView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [addingToPayRun, setAddingToPayRun] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfError, setPdfError] = useState(null);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '', isDestructive: false });

  useEffect(() => {
    fetchPaymentOrder();
  }, [id]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfUrl && pdfUrl.startsWith('blob:')) {
        window.URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  const fetchPaymentOrder = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/accounting/payment-orders/${id}`, {
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to fetch payment order');

      const data = await response.json();
      setPaymentOrder(data.payment_order);
      setItems(data.items || []);
      setActivities(data.activities || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };


  const handleViewPDF = async () => {
    try {
      setPdfError(null);
      setShowPdfModal(true);
      
      const response = await fetch(`/api/accounting/payment-orders/${id}/pdf`, {
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

      setPdfBlob(blob);
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
      const url = window.URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PaymentOrder_${paymentOrder?.display_id || id}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);
    } else if (pdfUrl) {
      const a = document.createElement('a');
      a.href = pdfUrl;
      a.download = `PaymentOrder_${paymentOrder?.display_id || id}.pdf`;
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
      const response = await fetch(`/api/accounting/payment-orders/${id}/send`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error('Failed to send email');

      toast.success('Payment order email sent successfully!');
      fetchPaymentOrder();
    } catch (err) {
      toast.error(`Error sending email: ${err.message}`);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleAddToPayRun = async () => {
    try {
      setAddingToPayRun(true);
      const response = await fetch(`/api/accounting/payment-orders/${id}/add-to-pay-run`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to add to pay run');

      toast.success('Payment order added to pay run!');
      fetchPaymentOrder();
    } catch (err) {
      toast.error(`Error adding to pay run: ${err.message}`);
    } finally {
      setAddingToPayRun(false);
    }
  };

  const handleMarkPaid = () => {
    setConfirmState({
      isOpen: true,
      title: 'Mark as Paid',
      message: 'Are you sure you want to mark this payment order as paid?',
      isDestructive: false,
      action: async () => {
        try {
          setMarkingPaid(true);
          const response = await fetch(`/api/accounting/payment-orders/${id}/mark-paid`, {
            method: 'POST',
            credentials: 'include',
          });

          if (!response.ok) throw new Error('Failed to mark as paid');

          toast.success('Payment order marked as paid!');
          fetchPaymentOrder();
        } catch (err) {
          toast.error(`Error marking as paid: ${err.message}`);
        } finally {
          setMarkingPaid(false);
        }
      },
    });
  };

  const handleVoid = () => {
    setConfirmState({
      isOpen: true,
      title: 'Void Payment Order',
      message: 'Are you sure you want to void this payment order? This cannot be undone.',
      isDestructive: true,
      action: async () => {
        try {
          setVoiding(true);
          const response = await fetch(`/api/accounting/payment-orders/${id}/void`, {
            method: 'POST',
            credentials: 'include',
          });

          if (!response.ok) throw new Error('Failed to void payment order');

          toast.success('Payment order voided!');
          fetchPaymentOrder();
        } catch (err) {
          toast.error(`Error voiding payment order: ${err.message}`);
        } finally {
          setVoiding(false);
        }
      },
    });
  };

  const handleRaise = async () => {
    try {
      const response = await fetch(`/api/accounting/payment-orders/${id}/raise`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to raise payment order');

      toast.success('Payment order raised!');
      fetchPaymentOrder();
    } catch (err) {
      toast.error(`Error raising payment order: ${err.message}`);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      draft: 'bg-neutral-100 text-neutral-800',
      raised: 'bg-blue-100 text-blue-800',
      sent: 'bg-blue-100 text-blue-800',
      unpaid: 'bg-yellow-100 text-yellow-800',
      paid: 'bg-green-100 text-green-800',
      in_pay_run: 'bg-purple-100 text-purple-800',
      void: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`px-3 py-1 inline-flex text-sm font-semibold rounded-full ${badges[status] || badges.draft}`}>
        {status ? status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Draft'}
      </span>
    );
  };

  const formatActivityAction = (action) => {
    const actionMap = {
      payment_order_created: 'Created a Payment Order',
      payment_order_raised: 'Raised a Payment Order',
      payment_order_sent: 'Sent a Payment Order',
      payment_order_paid: 'Marked a Payment Order as paid',
      email_sent: 'Sent Payment Order Email',
      payment_order_added_to_pay_run: 'Added to Pay Run',
      payment_order_marked_paid: 'Marked as Paid',
      payment_order_voided: 'Voided Payment Order',
    };
    return actionMap[action] || action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
        <p className="mt-4 text-neutral-600">Loading payment order...</p>
      </div>
    );
  }

  if (error || !paymentOrder) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div className="text-red-600">{error || 'Payment order not found'}</div>
      </div>
    );
  }

  const lessons = items.filter(item => !item.adhoc_charge_id);
  const adhocCharges = items.filter(item => item.adhoc_charge_id);

  const formatDisplayDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

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

  return (
    <div className="w-full">
      {/* Action Bar */}
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <button
          onClick={() => navigate('/accounting/raised-payment-orders')}
          className="text-sm text-neutral-600 hover:text-neutral-900 flex items-center gap-2 font-medium"
        >
          ← Back to Payment Orders
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleViewPDF}
            className="px-4 py-2 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 flex items-center gap-2 text-sm font-medium text-neutral-700 shadow-sm transition-all"
          >
            <DocumentArrowDownIcon className="h-5 w-5" />
            View PDF
          </button>
          
          {/* Resend Button - only if not draft or void */}
          {!['draft', 'void'].includes(paymentOrder.status) && (
            <button
              onClick={handleSendEmail}
              disabled={sendingEmail}
              className="px-4 py-2 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 flex items-center gap-2 text-sm font-medium text-neutral-700 shadow-sm transition-all disabled:opacity-50"
            >
              <EnvelopeIcon className="h-5 w-5" />
              {sendingEmail ? 'Sending...' : 'Resend Payment Order'}
            </button>
          )}

          {/* Add to Pay Run - only if raised, sent, or unpaid */}
          {['raised', 'sent', 'unpaid'].includes(paymentOrder.status) && (
            <button
              onClick={handleAddToPayRun}
              disabled={addingToPayRun}
              className="px-4 py-2 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 flex items-center gap-2 text-sm font-medium text-neutral-700 shadow-sm transition-all disabled:opacity-50"
            >
              <QueueListIcon className="h-5 w-5" />
              {addingToPayRun ? 'Adding...' : 'Add to Pay Run'}
            </button>
          )}

          {/* Mark as Paid - only if raised, sent, unpaid, or in_pay_run */}
          {['raised', 'sent', 'unpaid', 'in_pay_run'].includes(paymentOrder.status) && (
            <button
              onClick={handleMarkPaid}
              disabled={markingPaid}
              className="px-4 py-2 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 flex items-center gap-2 text-sm font-medium text-neutral-700 shadow-sm transition-all disabled:opacity-50"
            >
              <BanknotesIcon className="h-5 w-5" />
              {markingPaid ? 'Marking...' : 'Mark as Paid'}
            </button>
          )}

          {/* Mark Void - only if not void and not paid */}
          {!['void', 'paid'].includes(paymentOrder.status) && (
            <button
              onClick={handleVoid}
              disabled={voiding}
              className="px-4 py-2 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 flex items-center gap-2 text-sm font-medium text-neutral-700 shadow-sm transition-all disabled:opacity-50"
            >
              <NoSymbolIcon className="h-5 w-5" />
              {voiding ? 'Voiding...' : 'Mark Void'}
            </button>
          )}

          {/* Raise Payment Order - only if draft */}
          {paymentOrder.status === 'draft' && (
            <button
              onClick={handleRaise}
              className="px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-primary-700 flex items-center gap-2 text-sm font-medium transition-all shadow-sm"
            >
              <ArrowUpIcon className="h-5 w-5" />
              Raise Payment Order
            </button>
          )}
        </div>
      </div>

      {/* Payment Order Details Box */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 mb-6">
        <div className="flex flex-col md:flex-row items-start justify-between gap-4">
          {/* Left side - Payment Order to */}
          <div className="text-lg font-semibold text-neutral-900">
            Payment Order to {paymentOrder.payee_first} {paymentOrder.payee_last}
          </div>
          
          {/* Right side - Details */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-neutral-600 min-w-[120px]">Status:</span>
              <div>{getStatusBadge(paymentOrder.status)}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-neutral-600 min-w-[120px]">Payment Order Number:</span>
              <span className="text-sm font-medium text-neutral-900">{paymentOrder.display_id || `PO-${paymentOrder.id}`}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-neutral-600 min-w-[120px]">Date Created:</span>
              <span className="text-sm font-medium text-neutral-900">{formatDisplayDate(paymentOrder.date_created || paymentOrder.fetched_at)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-neutral-600 min-w-[120px]">Date Sent:</span>
              <span className="text-sm font-medium text-neutral-900">{paymentOrder.date_sent ? formatDisplayDate(paymentOrder.date_sent) : 'N/A'}</span>
            </div>
            {paymentOrder.date_paid && (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-neutral-600 min-w-[120px]">Date Paid:</span>
                <span className="text-sm font-medium text-neutral-900">{formatDisplayDate(paymentOrder.date_paid)}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-neutral-600 min-w-[120px]">Payee:</span>
              {paymentOrder.payee_id ? (
                <Link
                  to={`/tutors/${paymentOrder.payee_id}`}
                  className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {paymentOrder.payee_first} {paymentOrder.payee_last}
                </Link>
              ) : (
                <span className="text-sm font-medium text-neutral-900">{paymentOrder.payee_first} {paymentOrder.payee_last}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Payment Order Container */}
      <div className="bg-white rounded-xl shadow-lg border border-neutral-200 overflow-hidden mb-6">
        {/* Lessons Section */}
        <div className="px-8 py-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">Lessons & Charges</h3>
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
                      const startTime = item.appointment_start ? formatDisplayDateTime(item.appointment_start) : (item.date ? formatDisplayDateTime(item.date) : 'N/A');
                      const finishTime = item.appointment_finish ? formatDisplayDateTime(item.appointment_finish) : 'N/A';
                      const topic = item.appointment_topic || item.description || 'Lesson';
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
                            {item.adhoc_charge_id && (
                              <div className="text-xs text-neutral-500 mt-1">Ad Hoc Charge</div>
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
                    {paymentOrder.total_tax > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-neutral-600 font-medium">Total Tax:</span>
                        <span className="text-neutral-900 font-semibold">{formatCurrency(paymentOrder.total_tax)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-neutral-600 font-medium">Total to Charge Client:</span>
                      <span className="text-neutral-900 font-semibold">{formatCurrency(paymentOrder.total_to_charge_client || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-3 mt-3 border-t-2 border-brand-purple">
                      <span className="text-brand-purple font-bold text-base">Total to Pay Tutor:</span>
                      <span className="text-brand-purple font-bold text-xl">{formatCurrency(paymentOrder.amount)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-neutral-500 text-center py-8">No lessons or charges found</p>
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
                      <p className="text-xs text-neutral-500 mt-1">
                        {typeof activity.details === 'object' 
                          ? JSON.stringify(activity.details) 
                          : activity.details}
                      </p>
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
                    Payment Order {paymentOrder.display_id || `PO-${paymentOrder.id}`}
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
                          window.open(`/api/accounting/payment-orders/${id}/pdf`, '_blank');
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
                        const url = `/api/accounting/payment-orders/${id}/pdf`;
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
        onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={async () => {
          if (confirmState.action) await confirmState.action();
          setConfirmState(prev => ({ ...prev, isOpen: false }));
        }}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.title === 'Mark as Paid' ? 'Mark Paid' : 'Void'}
        isDestructive={confirmState.isDestructive}
      />
    </div>
  );
}

export default function PaymentOrderDetailViewWrapper() {
  return (
    <RoleProvider>
      <BranchProvider>
        <PaymentOrderDetailView />
      </BranchProvider>
    </RoleProvider>
  );
}
