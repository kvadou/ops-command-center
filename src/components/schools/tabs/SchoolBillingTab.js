import React, { useState, useEffect, useCallback } from 'react';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import {
  DocumentTextIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ArrowTopRightOnSquareIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PhoneIcon,
  EnvelopeIcon,
  ChatBubbleLeftIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

function InvoiceActivityPanel({ invoiceId, clientId, isOpen }) {
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showQuickNote, setShowQuickNote] = useState(false);
  const [quickNote, setQuickNote] = useState('');
  const [quickType, setQuickType] = useState(null); // 'note', 'call', 'email'
  const [submitting, setSubmitting] = useState(false);

  const fetchTimeline = useCallback(async () => {
    if (!isOpen || !invoiceId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/school-invoice-fulfillment/invoice/${invoiceId}/timeline`);
      if (res.ok) {
        const data = await res.json();
        setTimeline(data);
      }
    } catch (err) {
      console.error('Failed to fetch invoice timeline:', err);
    } finally {
      setLoading(false);
    }
  }, [invoiceId, isOpen]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  async function handleQuickAction(type) {
    if (quickType === type) {
      setShowQuickNote(false);
      setQuickType(null);
      return;
    }
    setQuickType(type);
    setShowQuickNote(true);
    setQuickNote('');
  }

  async function submitQuickAction() {
    if (!quickNote.trim()) return;
    setSubmitting(true);
    try {
      if (quickType === 'note') {
        await fetch(`/api/school-invoice-fulfillment/invoice/${invoiceId}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: quickNote, clientId }),
        });
      } else {
        await fetch(`/api/school-invoice-fulfillment/invoice/${invoiceId}/activity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activityType: quickType,
            description: quickNote,
            clientId,
          }),
        });
      }
      setQuickNote('');
      setShowQuickNote(false);
      setQuickType(null);
      fetchTimeline();
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="bg-neutral-50/80 border-t border-neutral-100">
      {/* Quick action buttons */}
      <div className="px-6 py-3 flex items-center gap-2 border-b border-neutral-100">
        <span className="text-xs font-medium text-neutral-500 mr-1">Quick:</span>
        {[
          { type: 'note', icon: ChatBubbleLeftIcon, label: 'Note', color: 'amber' },
          { type: 'call', icon: PhoneIcon, label: 'Call', color: 'blue' },
          { type: 'email', icon: EnvelopeIcon, label: 'Email', color: 'violet' },
        ].map(({ type, icon: Icon, label, color }) => (
          <button
            key={type}
            onClick={() => handleQuickAction(type)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all border ${
              quickType === type
                ? `bg-${color}-50 text-${color}-700 border-${color}-200`
                : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Quick note input */}
      {showQuickNote && (
        <div className="px-6 py-3 border-b border-neutral-100 bg-white">
          <div className="flex gap-2">
            <input
              type="text"
              value={quickNote}
              onChange={e => setQuickNote(e.target.value)}
              placeholder={
                quickType === 'call' ? 'Call summary...'
                : quickType === 'email' ? 'Email summary...'
                : 'Add a note...'
              }
              autoFocus
              onKeyDown={e => e.key === 'Enter' && submitQuickAction()}
              className="flex-1 px-3 py-1.5 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple"
            />
            <button
              onClick={submitQuickAction}
              disabled={submitting || !quickNote.trim()}
              className="px-3 py-1.5 text-sm font-medium text-white bg-brand-purple rounded-lg hover:bg-brand-purple/90 disabled:opacity-50 transition-colors"
            >
              {submitting ? '...' : 'Save'}
            </button>
            <button
              onClick={() => { setShowQuickNote(false); setQuickType(null); }}
              className="p-1.5 text-neutral-400 hover:text-neutral-600"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="px-6 py-3 max-h-64 overflow-y-auto">
        {loading ? (
          <div className="py-4 text-center text-sm text-neutral-400">Loading...</div>
        ) : timeline.length === 0 ? (
          <div className="py-4 text-center text-sm text-neutral-400">No activity yet</div>
        ) : (
          <div className="space-y-2.5">
            {timeline.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2.5">
                <div className={`mt-1 shrink-0 h-5 w-5 rounded flex items-center justify-center text-[10px] font-bold ${
                  item.type === 'note' ? 'bg-amber-100 text-amber-600'
                  : item.type === 'activity' ? 'bg-blue-100 text-blue-600'
                  : 'bg-violet-100 text-violet-600'
                }`}>
                  {item.type === 'note' ? 'N' : item.type === 'activity' ? 'A' : 'R'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-700 leading-snug">{item.content}</p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {item.createdBy} &middot; {formatDate(item.createdAt)}
                    {item.activityType && <span className="ml-1 text-neutral-300">({item.activityType})</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SchoolBillingTab({ school }) {
  const [invoices, setInvoices] = useState([]);
  const [filteredInvoices, setFilteredInvoices] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedInvoiceId, setExpandedInvoiceId] = useState(null);
  const [invoiceActivityCounts, setInvoiceActivityCounts] = useState({});
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [invoiceSummary, setInvoiceSummary] = useState(null);

  // Fetch invoices from the invoice fulfillment API
  useEffect(() => {
    async function fetchInvoices() {
      const clientId = school.clientId || school.client_id;
      if (!clientId) {
        setLoadingInvoices(false);
        return;
      }
      try {
        setLoadingInvoices(true);
        const res = await fetch(`/api/school-invoice-fulfillment/school/${clientId}/detail`, {
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          const rawInvoices = data.school?.invoices || [];
          // Map API fields to component fields
          const mapped = rawInvoices
            .filter(inv => !['cancelled', 'void', 'voided', 'refund', 'refunded'].includes(inv.status?.toLowerCase()))
            .map(inv => ({
              id: inv.invoice_id,
              invoiceNumber: inv.display_id,
              dateCreated: inv.date_sent,
              datePaid: inv.date_paid,
              amount: inv.amount,
              status: inv.status,
              isLate: inv.status === 'unpaid' && inv.days_outstanding > 0,
              daysOutstanding: Math.round(inv.days_outstanding || 0),
              tcUrl: inv.tutorcruncher_url,
              amountCollected: inv.amount_collected,
              amountOutstanding: inv.amount_outstanding,
              fulfillmentStatus: inv.fulfillment_status,
              reminderCount: inv.reminder_count,
            }));
          setInvoices(mapped);
          setInvoiceSummary(data.school?.invoiceSummary || null);
        }
      } catch (err) {
        console.error('Failed to fetch invoices:', err);
      } finally {
        setLoadingInvoices(false);
      }
    }
    fetchInvoices();
  }, [school.clientId, school.client_id]);

  useEffect(() => {
    let filtered = [...invoices];

    if (statusFilter !== 'all') {
      filtered = filtered.filter(inv => {
        if (statusFilter === 'paid') return inv.status === 'paid';
        if (statusFilter === 'unpaid') return inv.status === 'unpaid' || inv.status === 'open' || inv.status === 'payment-pending';
        if (statusFilter === 'late') return inv.isLate;
        return true;
      });
    }

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(inv =>
        inv.invoiceNumber?.toString().toLowerCase().includes(search)
      );
    }

    filtered.sort((a, b) => new Date(b.dateCreated || 0) - new Date(a.dateCreated || 0));
    setFilteredInvoices(filtered);
  }, [invoices, statusFilter, searchTerm]);

  // Fetch activity counts for each invoice (lightweight — just counts)
  useEffect(() => {
    async function fetchCounts() {
      const counts = {};
      const unpaidInvoices = invoices.filter(i => i.status !== 'paid').slice(0, 20);
      await Promise.allSettled(
        unpaidInvoices.map(async (inv) => {
          try {
            const res = await fetch(`/api/school-invoice-fulfillment/invoice/${inv.id}/timeline`);
            if (res.ok) {
              const data = await res.json();
              counts[inv.id] = data.length;
            }
          } catch {}
        })
      );
      setInvoiceActivityCounts(counts);
    }
    if (invoices.length > 0) fetchCounts();
  }, [invoices]);

  const getStatusBadge = (invoice) => {
    if (invoice.status === 'paid') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircleIcon className="h-3 w-3" />
          Paid
        </span>
      );
    }
    if (invoice.isLate || invoice.daysOutstanding > 30) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <ExclamationTriangleIcon className="h-3 w-3" />
          Late ({invoice.daysOutstanding}d)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
        <ClockIcon className="h-3 w-3" />
        Unpaid
      </span>
    );
  };

  const getBillingModelLabel = (model) => {
    const labels = {
      per_lesson: 'Per Lesson',
      per_student: 'Per Student',
      monthly_billing: 'Monthly',
      term_billing: 'Term',
      invoice_school_paid: 'Invoice (School Pays)',
      mixed: 'Mixed'
    };
    return labels[model] || model || 'N/A';
  };

  const paidTotal = invoiceSummary?.totalCollected ?? invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
  const unpaidTotal = invoiceSummary?.totalWithinTerms ?? invoices.filter(i => i.status !== 'paid' && !i.isLate).reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
  const lateTotal = invoiceSummary?.totalOutstanding ?? invoices.filter(i => i.isLate).reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);

  if (loadingInvoices) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-purple"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Billing Model Info */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">Billing Configuration</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-neutral-500">Billing Model</p>
            <p className="text-lg font-medium text-neutral-900">{getBillingModelLabel(school.billingModel)}</p>
          </div>
          <div>
            <p className="text-sm text-neutral-500">School Pays Directly</p>
            <p className="text-lg font-medium text-neutral-900">
              {school.billingModel === 'invoice_school_paid' ? 'Yes' : 'No (Parent-paid)'}
            </p>
          </div>
          <div>
            <p className="text-sm text-neutral-500">Total Balance</p>
            <p className={`text-lg font-medium ${unpaidTotal + lateTotal > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(unpaidTotal + lateTotal)}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <p className="text-sm text-neutral-500">Total Invoices</p>
          <p className="text-2xl font-bold text-neutral-900">{invoices.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <p className="text-sm text-neutral-500">Paid</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(paidTotal)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <p className="text-sm text-neutral-500">Unpaid</p>
          <p className="text-2xl font-bold text-yellow-600">{formatCurrency(unpaidTotal)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <p className="text-sm text-neutral-500">Late</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(lateTotal)}</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-neutral-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search invoices..."
              className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
            />
          </div>
          <div className="flex gap-2">
            {['all', 'paid', 'unpaid', 'late'].map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === status
                    ? 'bg-brand-purple text-white'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Invoices Table with expandable activity */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
        {filteredInvoices.length === 0 ? (
          <div className="p-8 text-center">
            <DocumentTextIcon className="mx-auto h-12 w-12 text-neutral-400" />
            <h3 className="mt-2 text-sm font-medium text-neutral-900">No invoices found</h3>
            <p className="mt-1 text-sm text-neutral-500">
              {statusFilter !== 'all' || searchTerm
                ? 'Try adjusting your filters'
                : 'No invoices have been created for this school yet'
              }
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider w-8"></th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Invoice</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Date Sent</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Paid / Overdue</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Activity</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-neutral-200">
                {filteredInvoices.map((invoice, index) => {
                  const isExpanded = expandedInvoiceId === invoice.id;
                  const activityCount = invoiceActivityCounts[invoice.id] || 0;

                  return (
                    <React.Fragment key={invoice.id || index}>
                      <tr
                        className={`transition-colors cursor-pointer ${isExpanded ? 'bg-neutral-50' : 'hover:bg-neutral-50'}`}
                        onClick={() => setExpandedInvoiceId(isExpanded ? null : invoice.id)}
                      >
                        <td className="pl-4 pr-0 py-4">
                          <button className="text-neutral-400 hover:text-neutral-600">
                            {isExpanded
                              ? <ChevronDownIcon className="h-4 w-4" />
                              : <ChevronRightIcon className="h-4 w-4" />
                            }
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900">
                          {invoice.tcUrl ? (
                            <a
                              href={invoice.tcUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-purple hover:text-brand-navy hover:underline"
                              onClick={e => e.stopPropagation()}
                            >
                              #INV-{invoice.invoiceNumber || invoice.id}
                            </a>
                          ) : (
                            <>#{invoice.invoiceNumber || invoice.id || index + 1}</>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                          {formatDate(invoice.dateCreated)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                          {invoice.status === 'paid' && invoice.datePaid
                            ? formatDate(invoice.datePaid)
                            : invoice.daysOutstanding > 0
                              ? <span className="text-red-500 font-medium">{invoice.daysOutstanding}d overdue</span>
                              : '—'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900">
                          {formatCurrency(invoice.amount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(invoice)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {activityCount > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-600">
                              <ChatBubbleLeftIcon className="h-3 w-3" />
                              {activityCount}
                            </span>
                          ) : (
                            <span className="text-neutral-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm" onClick={e => e.stopPropagation()}>
                          {invoice.tcUrl && (
                            <a
                              href={invoice.tcUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-brand-purple hover:text-brand-navy text-xs"
                              title="View in TutorCruncher"
                            >
                              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                              <span>TC</span>
                            </a>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="p-0">
                            <InvoiceActivityPanel
                              invoiceId={invoice.id}
                              clientId={school.clientId}
                              isOpen={isExpanded}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
