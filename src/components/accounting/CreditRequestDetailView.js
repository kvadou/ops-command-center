import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { useToast } from '../../hooks/useToast';
import { RoleProvider } from '../../contexts/RoleContext';
import { formatCurrency } from '../../utils/formatters';
import { BranchProvider } from '../../contexts/BranchContext';
import {
  DocumentArrowDownIcon,
  EnvelopeIcon,
  CheckIcon,
  XMarkIcon,
  CreditCardIcon,
  UserIcon,
  DocumentTextIcon,
  ArrowUpIcon,
} from '@heroicons/react/24/outline';

// Set up PDF.js worker - use CDN version that matches react-pdf's bundled pdfjs-dist
// react-pdf@10.2.0 bundles pdfjs-dist@5.4.296, so we use that exact version's worker
// Using CDN avoids Vite optimization issues with worker file imports
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.4.296/build/pdf.worker.min.mjs`;

function CreditRequestDetailView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [creditRequest, setCreditRequest] = useState(null);
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
  const [pdfLoading, setPdfLoading] = useState(false);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfBlob, setPdfBlob] = useState(null);

  useEffect(() => {
    fetchCreditRequest();
  }, [id]);

  const fetchCreditRequest = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/accounting/credit-requests/${id}`, {
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to fetch credit request');

      const data = await response.json();
      setCreditRequest(data.credit_request);
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
      setPdfLoading(true);
      setPdfError(null);
      setPageNumber(1);
      setNumPages(null);
      const response = await fetch(`/api/accounting/credit-requests/${id}/pdf`, {
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to generate PDF');

      const blob = await response.blob();
      setPdfBlob(blob);
      const url = window.URL.createObjectURL(blob);
      setPdfUrl(url);
      setShowPdfModal(true);
    } catch (err) {
      setPdfError(err.message);
      setPdfLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    if (pdfUrl) {
      const a = document.createElement('a');
      a.href = pdfUrl;
      a.download = `CreditRequest_${creditRequest?.display_id || id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(pdfUrl);
      document.body.removeChild(a);
    }
  };

  const handleSendEmail = async () => {
    try {
      setSendingEmail(true);
      const response = await fetch(`/api/accounting/credit-requests/${id}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ forceSend: true }),
      });

      if (!response.ok) throw new Error('Failed to send email');

      toast.success('Credit request email sent successfully!');
      fetchCreditRequest();
    } catch (err) {
      toast.error(`Error sending email: ${err.message}`);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleConfirm = async () => {
    try {
      const response = await fetch(`/api/accounting/credit-requests/${id}/confirm`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to confirm credit request');

      toast.success('Credit request confirmed!');
      fetchCreditRequest();
    } catch (err) {
      toast.error(`Error confirming credit request: ${err.message}`);
    }
  };

  const handleRaise = async () => {
    try {
      const response = await fetch(`/api/accounting/credit-requests/${id}/raise`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to raise credit request');

      toast.success('Credit request raised!');
      fetchCreditRequest();
    } catch (err) {
      toast.error(`Error raising credit request: ${err.message}`);
    }
  };

  const handleProcessPayment = async () => {
    try {
      setProcessingPayment(true);
      const response = await fetch(`/api/accounting/credit-requests/${id}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error('Failed to process payment');

      toast.success('Credit request payment processed successfully!');
      fetchCreditRequest();
    } catch (err) {
      toast.error(`Error processing payment: ${err.message}`);
    } finally {
      setProcessingPayment(false);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      draft: 'bg-neutral-100 text-neutral-800',
      confirmed: 'bg-blue-100 text-blue-800',
      raised: 'bg-purple-100 text-purple-800',
      paid: 'bg-green-100 text-green-800',
      approved: 'bg-green-100 text-green-800',
      void: 'bg-neutral-100 text-neutral-800',
    };
    return (
      <span className={`px-3 py-1 inline-flex text-sm font-semibold rounded-full ${badges[status] || badges.draft}`}>
        {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Draft'}
      </span>
    );
  };

  const formatActivityAction = (action) => {
    const actionMap = {
      created: 'Created Credit Request',
      updated: 'Updated Credit Request',
      confirmed: 'Confirmed Credit Request',
      raised: 'Raised Credit Request',
      paid: 'Processed Payment',
      email_sent: 'Sent Credit Request Email',
    };
    return actionMap[action] || action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto w-full">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
          <p className="mt-4 text-neutral-600">Loading credit request...</p>
        </div>
      </div>
    );
  }

  if (error || !creditRequest) {
    return (
      <div className="max-w-7xl mx-auto w-full">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="text-red-600">{error || 'Credit request not found'}</div>
        </div>
      </div>
    );
  }

  const creditAmount = parseFloat(creditRequest.amount) || 0;
  const stillToPay = parseFloat(creditRequest.still_to_pay) || 0;

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
          onClick={() => navigate('/accounting/raised-credit-requests')}
          className="text-sm text-neutral-600 hover:text-neutral-900 flex items-center gap-2 font-medium"
        >
          ← Back to Credit Requests
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleViewPDF}
            className="px-4 py-2 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 flex items-center gap-2 text-sm font-medium text-neutral-700 shadow-sm transition-all"
          >
            <DocumentArrowDownIcon className="h-5 w-5" />
            View Credit Request PDF
          </button>
          {creditRequest.status === 'draft' && (
            <button
              onClick={handleRaise}
              className="px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-primary-700 flex items-center gap-2 text-sm font-medium transition-all shadow-sm"
            >
              <ArrowUpIcon className="h-5 w-5" />
              Raise Credit Request
            </button>
          )}
          {creditRequest.status === 'raised' && creditRequest.client_id && (
            <button
              onClick={handleSendEmail}
              disabled={sendingEmail}
              className="px-4 py-2 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 flex items-center gap-2 text-sm font-medium text-neutral-700 shadow-sm transition-all disabled:opacity-50"
            >
              <EnvelopeIcon className="h-5 w-5" />
              {sendingEmail ? 'Sending...' : 'Send Email'}
            </button>
          )}
        </div>
      </div>

      {/* Credit Request Details Box */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 mb-6">
        <div className="flex flex-col md:flex-row items-start justify-between gap-4">
          {/* Left side - Credit Request to */}
          <div className="text-lg font-semibold text-neutral-900">
            Credit Request to {creditRequest.client_first_name || ''} {creditRequest.client_last_name || ''}
          </div>
          
          {/* Right side - Details */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-neutral-600 min-w-[120px]">Status:</span>
              <div>{getStatusBadge(creditRequest.status)}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-neutral-600 min-w-[120px]">Credit Request Number:</span>
              <span className="text-sm font-medium text-neutral-900">{creditRequest.display_id || creditRequest.credit_request_number || `PFI-${creditRequest.id}`}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-neutral-600 min-w-[120px]">Date Created:</span>
              <span className="text-sm font-medium text-neutral-900">{formatDisplayDate(creditRequest.date_created || creditRequest.fetched_at)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-neutral-600 min-w-[120px]">Date Sent:</span>
              <span className="text-sm font-medium text-neutral-900">{creditRequest.date_sent || creditRequest.date_raised ? formatDisplayDate(creditRequest.date_sent || creditRequest.date_raised) : 'N/A'}</span>
            </div>
            {creditRequest.date_paid && (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-neutral-600 min-w-[120px]">Date Paid:</span>
                <span className="text-sm font-medium text-neutral-900">{formatDisplayDate(creditRequest.date_paid)}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-neutral-600 min-w-[120px]">Client:</span>
              {creditRequest.client_id ? (
                <Link
                  to={`/clients/${creditRequest.client_id}`}
                  className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {creditRequest.client_first_name} {creditRequest.client_last_name}
                </Link>
              ) : (
                <span className="text-sm font-medium text-neutral-900">{creditRequest.client_first_name} {creditRequest.client_last_name}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Credit Request Container */}
      <div className="bg-white rounded-xl shadow-lg border border-neutral-200 overflow-hidden mb-6">
        {/* Items Section */}
        <div className="px-8 py-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">Items</h3>
          {items.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-brand-purple">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">Description</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-white uppercase tracking-wider">Units</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-white uppercase tracking-wider">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {items.map((item, idx) => {
                      const description = item.appointment_topic || item.custom_description || item.description || creditRequest?.description || creditRequest?.reason || '-';
                      const units = parseFloat(item.units) || 1;
                      const amount = parseFloat(item.amount) || 0;
                      
                      return (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                          <td className="px-4 py-4">
                            {item.appointment_id ? (
                              <Link
                                to={`/lessons/${item.appointment_id}`}
                                className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                {description}
                              </Link>
                            ) : (
                              <div className="text-sm font-medium text-neutral-900">{description}</div>
                            )}
                          </td>
                          <td className="px-4 py-4 text-sm text-neutral-600 text-right">{units}</td>
                          <td className="px-4 py-4 text-sm font-semibold text-neutral-900 text-right">{formatCurrency(amount)}</td>
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
                      <span className="text-neutral-600 font-medium">Total of items:</span>
                      <span className="text-neutral-900 font-semibold">{formatCurrency(creditAmount)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-neutral-600 font-medium">Amount already paid:</span>
                      <span className="text-neutral-900 font-semibold">{formatCurrency(creditRequest.date_paid ? creditAmount : 0)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-3 mt-3 border-t-2 border-brand-purple">
                      <span className="text-brand-purple font-bold text-base">AMOUNT DUE FOR PAYMENT:</span>
                      <span className="text-brand-purple font-bold text-xl">{formatCurrency(creditRequest.date_paid ? 0 : creditAmount)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-neutral-500 text-center py-8">No items found</p>
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
        {/* Balance Updates Section */}
        {balanceUpdates.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">Balance Updates</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-brand-purple">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">Method</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">Description</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-white uppercase tracking-wider">Credit Amount</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-white uppercase tracking-wider">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {balanceUpdates.map((update, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                      <td className="px-4 py-4 text-sm text-neutral-600 whitespace-nowrap">{formatDisplayDateTime(update.created_at)}</td>
                      <td className="px-4 py-4 text-sm text-neutral-900">{update.update_type || '-'}</td>
                      <td className="px-4 py-4 text-sm text-neutral-600">{update.payment_method || '-'}</td>
                      <td className="px-4 py-4 text-sm text-neutral-600">{update.description || '-'}</td>
                      <td className="px-4 py-4 text-sm text-neutral-900 text-right">{formatCurrency(parseFloat(update.change_amount) || 0)}</td>
                      <td className="px-4 py-4 text-sm font-semibold text-neutral-900 text-right">{formatCurrency(parseFloat(update.new_balance) || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
                        {typeof activity.details === 'string' ? activity.details : JSON.stringify(activity.details)}
                      </p>
                    )}
                    <p className="text-xs text-neutral-500 mt-1">{formatDisplayDateTime(activity.created_at)}</p>
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
                    Credit Request {creditRequest?.display_id || creditRequest?.credit_request_number || `PFI-${creditRequest?.id || id}`}
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
                          window.open(`/api/accounting/credit-requests/${id}/pdf`, '_blank');
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
                              Previous
                            </button>
                            <span className="text-sm font-medium text-neutral-700">
                              Page {pageNumber} of {numPages}
                            </span>
                            <button
                              onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))}
                              disabled={pageNumber >= numPages}
                              className="px-4 py-1.5 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-all"
                            >
                              Next
                            </button>
                          </div>
                        )}
                        <Page
                          pageNumber={pageNumber}
                          className="shadow-lg border border-neutral-300 rounded"
                          renderTextLayer={true}
                          renderAnnotationLayer={true}
                        />
                      </Document>
                    </div>
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
    </div>
  );
}

export default function CreditRequestDetailViewWrapper() {
  return (
    <RoleProvider>
      <BranchProvider>
        <CreditRequestDetailView />
      </BranchProvider>
    </RoleProvider>
  );
}
