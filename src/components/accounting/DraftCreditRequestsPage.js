import React, { useState, useEffect } from 'react';
import { useToast } from '../../hooks/useToast';
import { RoleProvider } from '../../contexts/RoleContext';
import { BranchProvider } from '../../contexts/BranchContext';
import { formatCurrency } from '../../utils/formatters';
import {
  ReceiptRefundIcon,
  EnvelopeIcon,
  XMarkIcon,
  CurrencyDollarIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

function DraftCreditRequestsPageContent() {
  const toast = useToast();
  const [draftCreditRequests, setDraftCreditRequests] = useState([]);
  const [confirmedCreditRequests, setConfirmedCreditRequests] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState(new Set());
  const [selectedConfirmed, setSelectedConfirmed] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRaiseModal, setShowRaiseModal] = useState(false);
  const [raising, setRaising] = useState(false);
  const [summary, setSummary] = useState({
    creditRequestsCount: 0,
    amount: 0,
  });

  useEffect(() => {
    fetchCreditRequests();
  }, []);

  const fetchCreditRequests = async () => {
    try {
      setLoading(true);
      // Fetch draft credit requests
      const draftParams = new URLSearchParams({ status: 'draft' });
      const draftResponse = await fetch(`/api/accounting/credit-requests?${draftParams}`, {
        credentials: 'include',
      });

      if (!draftResponse.ok) throw new Error('Failed to fetch draft credit requests');
      const draftData = await draftResponse.json();
      const draftCRs = draftData.credit_requests || [];
      
      // Group draft credit requests by client for display
      const draftGrouped = draftCRs.reduce((acc, cr) => {
        const key = cr.client_id || 'unknown';
        if (!acc[key]) {
          acc[key] = {
            client_id: cr.client_id,
            client_name: `${cr.client_first_name || ''} ${cr.client_last_name || ''}`.trim(),
            items: [],
            total: 0,
            creditRequestIds: [],
          };
        }
        acc[key].items.push(cr);
        acc[key].total += parseFloat(cr.amount) || 0;
        acc[key].creditRequestIds.push(cr.id);
        return acc;
      }, {});

      setDraftCreditRequests(Object.values(draftGrouped));
      
      // Fetch confirmed credit requests
      const confirmedParams = new URLSearchParams({ status: 'confirmed' });
      const confirmedResponse = await fetch(`/api/accounting/credit-requests?${confirmedParams}`, {
        credentials: 'include',
      });

      if (!confirmedResponse.ok) throw new Error('Failed to fetch confirmed credit requests');
      const confirmedData = await confirmedResponse.json();
      const confirmedCRs = confirmedData.credit_requests || [];
      
      // Group confirmed credit requests by client
      const confirmedGrouped = confirmedCRs.reduce((acc, cr) => {
        const key = cr.client_id || 'unknown';
        if (!acc[key]) {
          acc[key] = {
            client_id: cr.client_id,
            client_name: `${cr.client_first_name || ''} ${cr.client_last_name || ''}`.trim(),
            items: [],
            total: 0,
            creditRequestIds: [],
          };
        }
        acc[key].items.push(cr);
        acc[key].total += parseFloat(cr.amount) || 0;
        acc[key].creditRequestIds.push(cr.id);
        return acc;
      }, {});

      setConfirmedCreditRequests(Object.values(confirmedGrouped));
      
      // Calculate summary
      const allCRs = [...draftCRs, ...confirmedCRs];
      const amount = allCRs.reduce((sum, cr) => sum + (parseFloat(cr.amount) || 0), 0);
      
      setSummary({
        creditRequestsCount: allCRs.length,
        amount,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };


  const toggleDraftSelection = (clientId) => {
    const newSelected = new Set(selectedDraft);
    if (newSelected.has(clientId)) {
      newSelected.delete(clientId);
    } else {
      newSelected.add(clientId);
    }
    setSelectedDraft(newSelected);
  };

  const toggleAllDraft = () => {
    if (selectedDraft.size === draftCreditRequests.length) {
      setSelectedDraft(new Set());
    } else {
      setSelectedDraft(new Set(draftCreditRequests.map(cr => cr.client_id)));
    }
  };

  const toggleConfirmedSelection = (clientId) => {
    const newSelected = new Set(selectedConfirmed);
    if (newSelected.has(clientId)) {
      newSelected.delete(clientId);
    } else {
      newSelected.add(clientId);
    }
    setSelectedConfirmed(newSelected);
  };

  const toggleAllConfirmed = () => {
    if (selectedConfirmed.size === confirmedCreditRequests.length) {
      setSelectedConfirmed(new Set());
    } else {
      setSelectedConfirmed(new Set(confirmedCreditRequests.map(cr => cr.client_id)));
    }
  };

  const handleMoveToConfirmed = async (clientId) => {
    try {
      const group = draftCreditRequests.find(g => g.client_id === clientId);
      if (!group) return;

      // Batch confirm all credit requests for this client
      const response = await fetch('/api/accounting/credit-requests/batch-confirm', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          creditRequestIds: group.creditRequestIds,
        }),
      });

      if (!response.ok) throw new Error('Failed to confirm credit requests');

      await fetchCreditRequests();
      setSelectedDraft(new Set());
    } catch (err) {
      toast.error(`Error confirming credit requests: ${err.message}`);
    }
  };

  const handleMoveToDraft = async (clientId) => {
    try {
      const group = confirmedCreditRequests.find(g => g.client_id === clientId);
      if (!group) return;

      // Update status back to draft for all credit requests for this client
      for (const crId of group.creditRequestIds) {
        await fetch(`/api/accounting/credit-requests/${crId}`, {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'draft' }),
        });
      }

      await fetchCreditRequests();
      setSelectedConfirmed(new Set());
    } catch (err) {
      toast.error(`Error moving credit requests back to draft: ${err.message}`);
    }
  };

  const handleRaiseConfirmed = async () => {
    try {
      setRaising(true);
      // Get all credit request IDs from selected confirmed groups
      const creditRequestIds = [];
      for (const clientId of selectedConfirmed) {
        const group = confirmedCreditRequests.find(g => g.client_id === clientId);
        if (group) {
          creditRequestIds.push(...group.creditRequestIds);
        }
      }

      if (creditRequestIds.length === 0) {
        toast.error('Please select at least one confirmed credit request to raise');
        return;
      }

      const response = await fetch('/api/accounting/credit-requests/batch-raise', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          creditRequestIds,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to raise credit requests');
      }

      const data = await response.json();
      toast.success(`Raised ${data.raised} credit request(s). Email notifications sent.`);
      setShowRaiseModal(false);
      setSelectedConfirmed(new Set());
      await fetchCreditRequests();
    } catch (err) {
      toast.error(`Error raising credit requests: ${err.message}`);
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
            <h1 className="text-2xl font-bold text-neutral-900 mb-4">Draft Credit Requests</h1>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (selectedConfirmed.size === 0) {
                    toast.error('Please select at least one confirmed credit request to raise');
                    return;
                  }
                  setShowRaiseModal(true);
                }}
                className="px-6 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy flex items-center gap-2 text-sm font-medium transition-colors"
              >
                <EnvelopeIcon className="h-5 w-5" />
                Raise Confirmed Credit Request(s)
              </button>
            </div>
          </div>
          
          {/* Totals Box - Upper Right */}
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 min-w-[200px]">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Totals</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-600">Credit Requests Count:</span>
                <span className="font-semibold text-neutral-900">{summary.creditRequestsCount}</span>
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
        {/* Draft Credit Requests Column - Left */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={selectedDraft.size === draftCreditRequests.length && draftCreditRequests.length > 0}
                onChange={toggleAllDraft}
                className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
              />
              <span className="ml-2 font-medium text-neutral-900">
                Draft Credit Requests
                {draftCreditRequests.length > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-semibold bg-neutral-900 text-white rounded-full">
                    {draftCreditRequests.length}
                  </span>
                )}
              </span>
            </label>
            <ArrowRightIcon className="h-5 w-5 text-neutral-400" />
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple mx-auto"></div>
              <p className="mt-4 text-sm text-neutral-600">Loading credit requests...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-600">{error}</div>
          ) : draftCreditRequests.length === 0 ? (
            <div className="text-center py-12">
              <ReceiptRefundIcon className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
              <p className="text-neutral-600">No draft credit requests</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto scrollbar-hide">
              {draftCreditRequests.map((group) => (
                <div
                  key={group.client_id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-neutral-50 border border-neutral-100 transition-colors"
                >
                  <div className="flex items-center flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedDraft.has(group.client_id)}
                      onChange={() => toggleDraftSelection(group.client_id)}
                      className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded mr-3 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-neutral-900 truncate text-sm">
                          {group.client_name}
                        </span>
                        <span className="text-xs text-neutral-500">
                          • {group.items.length} Items
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <button
                      onClick={() => handleMoveToConfirmed(group.client_id)}
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

        {/* Confirmed Credit Requests Column - Right */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <ArrowLeftIcon className="h-5 w-5 text-neutral-400" />
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={selectedConfirmed.size === confirmedCreditRequests.length && confirmedCreditRequests.length > 0}
                onChange={toggleAllConfirmed}
                className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
              />
              <span className="ml-2 font-medium text-neutral-900">
                Confirmed Credit Requests
                {confirmedCreditRequests.length > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-semibold bg-neutral-900 text-white rounded-full">
                    {confirmedCreditRequests.length}
                  </span>
                )}
              </span>
            </label>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple mx-auto"></div>
              <p className="mt-4 text-sm text-neutral-600">Loading credit requests...</p>
            </div>
          ) : confirmedCreditRequests.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircleIcon className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
              <p className="text-neutral-600">No Confirmed Credit Requests</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto scrollbar-hide">
              {confirmedCreditRequests.map((group) => (
                <div
                  key={group.client_id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-neutral-50 border border-neutral-100 transition-colors"
                >
                  <div className="flex items-center flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedConfirmed.has(group.client_id)}
                      onChange={() => toggleConfirmedSelection(group.client_id)}
                      className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded mr-3 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-neutral-900 truncate text-sm">
                          {group.client_name}
                        </span>
                        <span className="text-xs text-neutral-500">
                          • {group.items.length} Items
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <button
                      onClick={() => handleMoveToDraft(group.client_id)}
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

      {/* Raise Confirmed Credit Requests Modal */}
      {showRaiseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-neutral-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-neutral-900">Raise Confirmed Credit Request(s)</h2>
              <button
                onClick={() => setShowRaiseModal(false)}
                className="p-1 hover:bg-neutral-100 rounded transition-colors"
              >
                <XMarkIcon className="h-6 w-6 text-neutral-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-neutral-600">
                {selectedConfirmed.size} confirmed Credit Request(s) will be raised.
              </p>
              <p className="text-sm text-neutral-700 font-medium">
                Select which Credit Requests you want to send notifications for:
              </p>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                <label className="flex items-center p-3 hover:bg-neutral-50 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedConfirmed.size === confirmedCreditRequests.length && confirmedCreditRequests.length > 0}
                    onChange={toggleAllConfirmed}
                    className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
                  />
                  <span className="ml-3 font-medium text-neutral-900">Select All</span>
                </label>
                {confirmedCreditRequests
                  .filter(group => selectedConfirmed.has(group.client_id))
                  .map((group) => (
                    <label
                      key={group.client_id}
                      className="flex items-center p-3 hover:bg-neutral-50 rounded-lg cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={true}
                        onChange={() => toggleConfirmedSelection(group.client_id)}
                        className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
                      />
                      <span className="ml-3 font-medium text-neutral-900">
                        {group.client_name} - {formatCurrency(group.total)}
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
                  'Raise Credit Requests'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DraftCreditRequestsPage() {
  return (
    <RoleProvider>
      <BranchProvider>
        <DraftCreditRequestsPageContent />
      </BranchProvider>
    </RoleProvider>
  );
}
