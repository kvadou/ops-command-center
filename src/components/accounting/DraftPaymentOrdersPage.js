import React, { useState, useEffect } from 'react';
import { useToast } from '../../hooks/useToast';
import { RoleProvider } from '../../contexts/RoleContext';
import { BranchProvider } from '../../contexts/BranchContext';
import { formatCurrency } from '../../utils/formatters';
import {
  BanknotesIcon,
  EnvelopeIcon,
  XMarkIcon,
  CurrencyDollarIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

function DraftPaymentOrdersPageContent() {
  const toast = useToast();
  const [draftPaymentOrders, setDraftPaymentOrders] = useState([]);
  const [confirmedPaymentOrders, setConfirmedPaymentOrders] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState(new Set());
  const [selectedConfirmed, setSelectedConfirmed] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showRaiseModal, setShowRaiseModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [raising, setRaising] = useState(false);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const [includeUnpaidInvoice, setIncludeUnpaidInvoice] = useState(false);
  const [lastGenerated, setLastGenerated] = useState(null);
  const [summary, setSummary] = useState({
    paymentOrderCount: 0,
    tutorTax: 0,
    amount: 0,
  });

  useEffect(() => {
    fetchPaymentOrders();
  }, []);

  const fetchPaymentOrders = async () => {
    try {
      setLoading(true);
      // Fetch draft payment orders
      const draftParams = new URLSearchParams({ status: 'draft' });
      const draftResponse = await fetch(`/api/accounting/payment-orders?${draftParams}`, {
        credentials: 'include',
      });

      if (!draftResponse.ok) throw new Error('Failed to fetch draft payment orders');
      const draftData = await draftResponse.json();
      const draftPOs = draftData.payment_orders || [];
      
      // Group draft payment orders by payee for display
      const draftGrouped = draftPOs.reduce((acc, po) => {
        const key = po.payee_id || 'unknown';
        if (!acc[key]) {
          acc[key] = {
            payee_id: po.payee_id,
            payee_name: `${po.payee_first || ''} ${po.payee_last || ''}`.trim(),
            items: [],
            total: 0,
            paymentOrderIds: [],
          };
        }
        acc[key].items.push(po);
        acc[key].total += parseFloat(po.amount) || 0;
        acc[key].paymentOrderIds.push(po.id);
        return acc;
      }, {});

      setDraftPaymentOrders(Object.values(draftGrouped));
      
      // Fetch confirmed payment orders
      const confirmedParams = new URLSearchParams({ status: 'confirmed' });
      const confirmedResponse = await fetch(`/api/accounting/payment-orders?${confirmedParams}`, {
        credentials: 'include',
      });

      if (!confirmedResponse.ok) throw new Error('Failed to fetch confirmed payment orders');
      const confirmedData = await confirmedResponse.json();
      const confirmedPOs = confirmedData.payment_orders || [];
      
      // Group confirmed payment orders by payee
      const confirmedGrouped = confirmedPOs.reduce((acc, po) => {
        const key = po.payee_id || 'unknown';
        if (!acc[key]) {
          acc[key] = {
            payee_id: po.payee_id,
            payee_name: `${po.payee_first || ''} ${po.payee_last || ''}`.trim(),
            items: [],
            total: 0,
            paymentOrderIds: [],
          };
        }
        acc[key].items.push(po);
        acc[key].total += parseFloat(po.amount) || 0;
        acc[key].paymentOrderIds.push(po.id);
        return acc;
      }, {});

      setConfirmedPaymentOrders(Object.values(confirmedGrouped));
      
      // Calculate summary
      const allPOs = [...draftPOs, ...confirmedPOs];
      const amount = allPOs.reduce((sum, po) => sum + (parseFloat(po.amount) || 0), 0);
      
      setSummary({
        paymentOrderCount: allPOs.length,
        tutorTax: 0,
        amount,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };


  const toggleDraftSelection = (payeeId) => {
    const newSelected = new Set(selectedDraft);
    if (newSelected.has(payeeId)) {
      newSelected.delete(payeeId);
    } else {
      newSelected.add(payeeId);
    }
    setSelectedDraft(newSelected);
  };

  const toggleAllDraft = () => {
    if (selectedDraft.size === draftPaymentOrders.length) {
      setSelectedDraft(new Set());
    } else {
      setSelectedDraft(new Set(draftPaymentOrders.map(po => po.payee_id)));
    }
  };

  const toggleConfirmedSelection = (payeeId) => {
    const newSelected = new Set(selectedConfirmed);
    if (newSelected.has(payeeId)) {
      newSelected.delete(payeeId);
    } else {
      newSelected.add(payeeId);
    }
    setSelectedConfirmed(newSelected);
  };

  const toggleAllConfirmed = () => {
    if (selectedConfirmed.size === confirmedPaymentOrders.length) {
      setSelectedConfirmed(new Set());
    } else {
      setSelectedConfirmed(new Set(confirmedPaymentOrders.map(po => po.payee_id)));
    }
  };

  const handleMoveToConfirmed = async (payeeId) => {
    try {
      const group = draftPaymentOrders.find(g => g.payee_id === payeeId);
      if (!group) return;

      // Batch confirm all payment orders for this payee
      const response = await fetch('/api/accounting/payment-orders/batch-confirm', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentOrderIds: group.paymentOrderIds,
        }),
      });

      if (!response.ok) throw new Error('Failed to confirm payment orders');

      // Refresh the list
      await fetchPaymentOrders();
      setSelectedDraft(new Set());
    } catch (err) {
      toast.error(`Error confirming payment orders: ${err.message}`);
    }
  };

  const handleMoveToDraft = async (payeeId) => {
    try {
      const group = confirmedPaymentOrders.find(g => g.payee_id === payeeId);
      if (!group) return;

      // Update status back to draft for all payment orders for this payee
      for (const poId of group.paymentOrderIds) {
        await fetch(`/api/accounting/payment-orders/${poId}`, {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'draft' }),
        });
      }

      // Refresh the list
      await fetchPaymentOrders();
      setSelectedConfirmed(new Set());
    } catch (err) {
      toast.error(`Error moving payment orders back to draft: ${err.message}`);
    }
  };

  const handleGenerateFromLessons = async () => {
    try {
      setGenerating(true);
      const response = await fetch('/api/accounting/payment-orders/generate-from-lessons', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          regenerate: false,
          forceGenerate: true, // Enable for local testing
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate payment orders');
      }

      const data = await response.json();
      setLastGenerated({
        count: data.paymentOrdersCreated || 0,
        updated: data.paymentOrdersUpdated || 0,
        timestamp: new Date(),
      });
      setShowGenerateModal(false);
      await fetchPaymentOrders(); // Refresh the list
    } catch (err) {
      toast.error(`Error generating payment orders: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleRaiseConfirmed = async () => {
    try {
      setRaising(true);
      // Get all payment order IDs from selected confirmed groups
      const paymentOrderIds = [];
      for (const payeeId of selectedConfirmed) {
        const group = confirmedPaymentOrders.find(g => g.payee_id === payeeId);
        if (group) {
          paymentOrderIds.push(...group.paymentOrderIds);
        }
      }

      if (paymentOrderIds.length === 0) {
        toast.error('Please select at least one confirmed payment order to raise');
        return;
      }

      const response = await fetch('/api/accounting/payment-orders/batch-raise', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentOrderIds,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to raise payment orders');
      }

      const data = await response.json();
      toast.success(`Raised ${data.raised} payment order(s). Email notifications sent.`);
      setShowRaiseModal(false);
      setSelectedConfirmed(new Set());
      await fetchPaymentOrders(); // Refresh the list
    } catch (err) {
      toast.error(`Error raising payment orders: ${err.message}`);
    } finally {
      setRaising(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-6 xl:px-8 py-4 sm:py-6">
      {/* Header with Action Buttons */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-6 mb-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-neutral-900 mb-4">Draft Payment Orders</h1>
            {lastGenerated && (
              <p className="text-sm text-neutral-500 mb-4">
                Last generated {lastGenerated.count} Payment Orders {lastGenerated.updated > 0 ? `(${lastGenerated.updated} updated)` : ''} {Math.floor((new Date() - lastGenerated.timestamp) / (1000 * 60 * 60 * 24))} days, {Math.floor(((new Date() - lastGenerated.timestamp) / (1000 * 60 * 60)) % 24)} hours ago
              </p>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowGenerateModal(true)}
                className="px-6 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy flex items-center gap-2 text-sm font-medium transition-colors"
              >
                <BanknotesIcon className="h-5 w-5" />
                Generate Payment Orders
              </button>
              <button
                onClick={() => {
                  if (selectedConfirmed.size === 0) {
                    toast.error('Please select at least one confirmed payment order to raise');
                    return;
                  }
                  setShowRaiseModal(true);
                }}
                className="px-6 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy flex items-center gap-2 text-sm font-medium transition-colors"
              >
                <EnvelopeIcon className="h-5 w-5" />
                Raise Confirmed Payment Order(s)
              </button>
            </div>
          </div>
          
          {/* Totals Box - Upper Right */}
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 min-w-[200px]">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Totals</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-600">Payment Order Count:</span>
                <span className="font-semibold text-neutral-900">{summary.paymentOrderCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-600">Tutor Tax:</span>
                <span className="font-semibold text-neutral-900">{formatCurrency(summary.tutorTax)}</span>
              </div>
              <div className="border-t border-neutral-200 pt-3 mt-3">
                <div className="flex justify-between">
                  <span className="font-semibold text-neutral-900">Amount:</span>
                  <span className="font-bold text-lg text-brand-purple">{formatCurrency(summary.amount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Draft Payment Orders Column - Left */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={selectedDraft.size === draftPaymentOrders.length && draftPaymentOrders.length > 0}
                onChange={toggleAllDraft}
                className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
              />
              <span className="ml-2 font-medium text-neutral-900">
                Draft Payment Orders
                {draftPaymentOrders.length > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-semibold bg-neutral-900 text-white rounded-full">
                    {draftPaymentOrders.length}
                  </span>
                )}
              </span>
            </label>
            <ArrowRightIcon className="h-5 w-5 text-neutral-400" />
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple mx-auto"></div>
              <p className="mt-4 text-sm text-neutral-600">Loading payment orders...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-600">{error}</div>
          ) : draftPaymentOrders.length === 0 ? (
            <div className="text-center py-12">
              <BanknotesIcon className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
              <p className="text-neutral-600">No draft payment orders</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto scrollbar-hide">
              {draftPaymentOrders.map((group) => (
                <div
                  key={group.payee_id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-neutral-50 border border-neutral-100 transition-colors"
                >
                  <div className="flex items-center flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedDraft.has(group.payee_id)}
                      onChange={() => toggleDraftSelection(group.payee_id)}
                      className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded mr-3 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-neutral-900 truncate text-sm">
                          {group.payee_name}
                        </span>
                        <span className="text-xs text-neutral-500">
                          • {group.items.length} Items
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <button
                      onClick={() => handleMoveToConfirmed(group.payee_id)}
                      className="p-1.5 hover:bg-brand-purple/10 rounded transition-colors group"
                      title="Move to Confirmed"
                    >
                      <ArrowRightIcon className="h-5 w-5 text-neutral-400 group-hover:text-brand-purple transition-colors" />
                    </button>
                    <EnvelopeIcon className="h-5 w-5 text-neutral-400" />
                    <span className="font-semibold text-neutral-900 whitespace-nowrap">
                      {formatCurrency(group.total)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Confirmed Payment Orders Column - Right */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <ArrowLeftIcon className="h-5 w-5 text-neutral-400" />
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={selectedConfirmed.size === confirmedPaymentOrders.length && confirmedPaymentOrders.length > 0}
                onChange={toggleAllConfirmed}
                className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
              />
              <span className="ml-2 font-medium text-neutral-900">
                Confirmed Payment Orders
                {confirmedPaymentOrders.length > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-semibold bg-neutral-900 text-white rounded-full">
                    {confirmedPaymentOrders.length}
                  </span>
                )}
              </span>
            </label>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple mx-auto"></div>
              <p className="mt-4 text-sm text-neutral-600">Loading payment orders...</p>
            </div>
          ) : confirmedPaymentOrders.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircleIcon className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
              <p className="text-neutral-600">No Confirmed Payment Orders</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto scrollbar-hide">
              {confirmedPaymentOrders.map((group) => (
                <div
                  key={group.payee_id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-neutral-50 border border-neutral-100 transition-colors"
                >
                  <div className="flex items-center flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedConfirmed.has(group.payee_id)}
                      onChange={() => toggleConfirmedSelection(group.payee_id)}
                      className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded mr-3 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-neutral-900 truncate text-sm">
                          {group.payee_name}
                        </span>
                        <span className="text-xs text-neutral-500">
                          • {group.items.length} Items
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <button
                      onClick={() => handleMoveToDraft(group.payee_id)}
                      className="p-1.5 hover:bg-brand-purple/10 rounded transition-colors group"
                      title="Move back to Draft"
                    >
                      <ArrowLeftIcon className="h-5 w-5 text-neutral-400 group-hover:text-brand-purple transition-colors" />
                    </button>
                    <EnvelopeIcon className="h-5 w-5 text-neutral-400" />
                    <span className="font-semibold text-neutral-900 whitespace-nowrap">
                      {formatCurrency(group.total)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Generate Payment Orders Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-neutral-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-neutral-900">Generate Payment Orders</h2>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="p-1 hover:bg-neutral-100 rounded transition-colors"
              >
                <XMarkIcon className="h-6 w-6 text-neutral-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-neutral-600">
                Below, you can generate Payment Orders for any completed Lessons.
              </p>
              {lastGenerated && (
                <p className="text-sm text-neutral-500">
                  Last generated {lastGenerated.count} Payment Orders {lastGenerated.updated > 0 ? `(${lastGenerated.updated} updated)` : ''} {Math.floor((new Date() - lastGenerated.timestamp) / (1000 * 60 * 60 * 24))} days, {Math.floor(((new Date() - lastGenerated.timestamp) / (1000 * 60 * 60)) % 24)} hours ago
                </p>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Cutoff Start Date*
                  </label>
                  <input
                    type="date"
                    value={dateRange.startDate}
                    onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    Items will only be generated for charges after or on this date, default is 6 months ago.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Cutoff End Date*
                  </label>
                  <input
                    type="date"
                    value={dateRange.endDate}
                    onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    Items will only be generated for charges before or on this date.
                  </p>
                </div>
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="includeUnpaidInvoice"
                    checked={includeUnpaidInvoice}
                    onChange={(e) => setIncludeUnpaidInvoice(e.target.checked)}
                    className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded mt-1"
                  />
                  <label htmlFor="includeUnpaidInvoice" className="ml-2 text-sm text-neutral-700">
                    <span className="font-medium">Generate Payment Orders including items not associated with a paid Invoice</span>
                    <p className="text-xs text-neutral-500 mt-1">
                      If checked Payment Orders will be generated regardless of whether the items are associated with a Paid Invoice.
                    </p>
                  </label>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Please note</strong> that all current <strong>Payment Orders</strong> that are in a Draft or Confirmed state will be <strong>cleared</strong>.
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-neutral-200 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowGenerateModal(false)}
                className="px-4 py-2 text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateFromLessons}
                disabled={generating}
                className="px-6 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy flex items-center gap-2 disabled:opacity-50 transition-colors"
              >
                {generating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Generating...
                  </>
                ) : (
                  'Regenerate'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Raise Confirmed Payment Orders Modal */}
      {showRaiseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-neutral-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-neutral-900">Raise Confirmed Payment Order(s)</h2>
              <button
                onClick={() => setShowRaiseModal(false)}
                className="p-1 hover:bg-neutral-100 rounded transition-colors"
              >
                <XMarkIcon className="h-6 w-6 text-neutral-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-neutral-600">
                {selectedConfirmed.size} confirmed Payment Order(s) will be raised.
              </p>
              <p className="text-sm text-neutral-700 font-medium">
                Select which Payment Orders you want to send notifications for:
              </p>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                <label className="flex items-center p-3 hover:bg-neutral-50 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedConfirmed.size === confirmedPaymentOrders.length && confirmedPaymentOrders.length > 0}
                    onChange={toggleAllConfirmed}
                    className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
                  />
                  <span className="ml-3 font-medium text-neutral-900">Select All</span>
                </label>
                {confirmedPaymentOrders
                  .filter(group => selectedConfirmed.has(group.payee_id))
                  .map((group) => (
                    <label
                      key={group.payee_id}
                      className="flex items-center p-3 hover:bg-neutral-50 rounded-lg cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={true}
                        onChange={() => toggleConfirmedSelection(group.payee_id)}
                        className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
                      />
                      <span className="ml-3 font-medium text-neutral-900">
                        {group.payee_name} - {formatCurrency(group.total)}
                      </span>
                    </label>
                  ))}
              </div>
            </div>
            <div className="p-6 border-t border-neutral-200 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowRaiseModal(false)}
                className="px-4 py-2 text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRaiseConfirmed}
                disabled={raising || selectedConfirmed.size === 0}
                className="px-6 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy flex items-center gap-2 disabled:opacity-50 transition-colors"
              >
                {raising ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Raising...
                  </>
                ) : (
                  'Raise Payment Orders'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DraftPaymentOrdersPage() {
  return (
    <RoleProvider>
      <BranchProvider>
        <DraftPaymentOrdersPageContent />
      </BranchProvider>
    </RoleProvider>
  );
}
