import React, { useState, useEffect, useCallback } from 'react';
import MarketingChat from '../../components/marketing/MarketingChat';
import MarketingCommandSidebar from '../../components/marketing/MarketingCommandSidebar';
import PendingActionsQueue from '../../components/marketing/PendingActionsQueue';
import ActionConfirmationModal from '../../components/marketing/ActionConfirmationModal';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import {
  ClockIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';

/**
 * MarketingAdvisorPage - AI Advisor page within Marketing Hub
 *
 * Wraps the existing MarketingChat component with the new layout
 */
export default function MarketingAdvisorPage() {
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [pendingActions, setPendingActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showActionsPanel, setShowActionsPanel] = useState(false);
  const [showConversationsPanel, setShowConversationsPanel] = useState(false);

  // Toast notification state
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState({ open: false, action: null });
  const [executingActionId, setExecutingActionId] = useState(null);

  // Toast helper
  const showToast = useCallback((message, severity = 'success') => {
    setToast({ open: true, message, severity });
  }, []);

  const closeToast = useCallback(() => {
    setToast(prev => ({ ...prev, open: false }));
  }, []);

  // Load initial data
  useEffect(() => {
    loadConversations();
    loadPendingActions();
  }, []);

  const loadConversations = async () => {
    try {
      const res = await fetch('/api/marketing-command-center/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (err) {
      console.error('Error loading conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPendingActions = async () => {
    try {
      const res = await fetch('/api/marketing-command-center/pending-actions');
      if (res.ok) {
        const data = await res.json();
        setPendingActions(data);
      }
    } catch (err) {
      console.error('Error loading pending actions:', err);
    }
  };

  const handleNewConversation = useCallback(() => {
    setActiveConversationId(null);
  }, []);

  const handleSelectConversation = useCallback((id) => {
    setActiveConversationId(id);
    setShowConversationsPanel(false);
  }, []);

  const handleConversationCreated = useCallback((newId) => {
    setActiveConversationId(newId);
    loadConversations();
  }, []);

  // Open confirmation modal before approving
  const handleActionApproveRequest = useCallback((action) => {
    setConfirmModal({ open: true, action });
  }, []);

  // Actually execute the action after confirmation
  const handleActionConfirmed = useCallback(async () => {
    const action = confirmModal.action;
    if (!action) return;

    setConfirmModal({ open: false, action: null });
    setExecutingActionId(action.id);

    try {
      // Step 1: Approve the action
      const approveRes = await fetch(`/api/marketing-command-center/approve-action/${action.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!approveRes.ok) {
        const error = await approveRes.json();
        console.error('Error approving action:', error);
        showToast(`Failed to approve: ${error.error || 'Unknown error'}`, 'error');
        setExecutingActionId(null);
        return;
      }

      // Step 2: Execute the approved action
      const executeRes = await fetch(`/api/marketing-command-center/execute-action/${action.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!executeRes.ok) {
        const error = await executeRes.json();
        console.error('Error executing action:', error);
        showToast(`Approved but execution failed: ${error.error || 'Unknown error'}`, 'warning');
      } else {
        showToast(`Action executed successfully: ${action.target_name}`, 'success');
      }

      // Refresh the actions list
      loadPendingActions();
    } catch (err) {
      console.error('Error processing action:', err);
      showToast('An error occurred while processing the action.', 'error');
    } finally {
      setExecutingActionId(null);
    }
  }, [confirmModal.action, showToast]);

  // Cancel confirmation
  const handleActionCancelled = useCallback(() => {
    setConfirmModal({ open: false, action: null });
  }, []);

  const handleActionRejected = useCallback(async (actionId, reason) => {
    try {
      const res = await fetch(`/api/marketing-command-center/reject-action/${actionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });

      if (res.ok) {
        showToast('Action rejected', 'info');
        loadPendingActions();
      } else {
        const error = await res.json();
        showToast(`Failed to reject: ${error.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      console.error('Error rejecting action:', err);
      showToast('Failed to reject action', 'error');
    }
  }, [showToast]);

  // Callback when chat receives new pending actions
  const handleNewPendingActions = useCallback((actions) => {
    if (actions && actions.length > 0) {
      loadPendingActions();
      setShowActionsPanel(true);
    }
  }, []);

  return (
    <>
      {/* Full-height chat layout - fills available viewport */}
      <div className="flex flex-1 min-h-0 h-full">
        {/* Conversations Panel (collapsible on desktop) */}
        <div className={`
          ${showConversationsPanel ? 'fixed inset-0 z-50 lg:relative lg:inset-auto' : 'hidden lg:block'}
          lg:w-72 lg:flex-shrink-0 lg:border-r lg:border-neutral-200 lg:bg-white lg:self-stretch
        `}>
          {/* Mobile overlay */}
          <div
            className="lg:hidden absolute inset-0 bg-black/30"
            onClick={() => setShowConversationsPanel(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-lg lg:shadow-none lg:static lg:w-full lg:h-full">
            <MarketingCommandSidebar
              conversations={conversations}
              activeConversationId={activeConversationId}
              loading={loading}
              onNewConversation={handleNewConversation}
              onSelectConversation={handleSelectConversation}
            />
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-neutral-50">
          {/* Header with controls */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-200 bg-white">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowConversationsPanel(!showConversationsPanel)}
                className={`lg:hidden p-2 rounded-lg transition-colors ${
                  showConversationsPanel ? 'bg-brand-purple/10 text-brand-purple' : 'text-neutral-500 hover:bg-neutral-100'
                }`}
              >
                <ChatBubbleLeftRightIcon className="h-5 w-5" />
              </button>
              <h1 className="text-lg font-semibold text-neutral-900">AI Marketing Advisor</h1>
            </div>
            <button
              onClick={() => setShowActionsPanel(!showActionsPanel)}
              className={`p-2 rounded-lg transition-colors relative ${
                showActionsPanel ? 'bg-brand-purple/10 text-brand-purple' : 'text-neutral-500 hover:bg-neutral-100'
              }`}
            >
              <ClockIcon className="h-5 w-5" />
              {pendingActions.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-xs rounded-full flex items-center justify-center">
                  {pendingActions.length}
                </span>
              )}
            </button>
          </div>

          {/* Chat Component */}
          <MarketingChat
            conversationId={activeConversationId}
            onConversationCreated={handleConversationCreated}
            onNewPendingActions={handleNewPendingActions}
            className="flex-1"
          />
        </div>

        {/* Pending Actions Panel */}
        {(showActionsPanel || pendingActions.length > 0) && (
          <div className={`
            ${showActionsPanel ? 'fixed inset-0 z-50 lg:relative lg:inset-auto' : 'hidden lg:block'}
            lg:w-80 lg:flex-shrink-0 lg:border-l lg:border-neutral-200 lg:bg-white lg:self-stretch
          `}>
            {/* Mobile overlay */}
            <div
              className="lg:hidden absolute inset-0 bg-black/30"
              onClick={() => setShowActionsPanel(false)}
            />
            <div className="absolute right-0 top-0 bottom-0 w-80 bg-white shadow-lg lg:shadow-none lg:static lg:w-full lg:h-full">
              <PendingActionsQueue
                actions={pendingActions}
                onApprove={handleActionApproveRequest}
                onReject={handleActionRejected}
                onClose={() => setShowActionsPanel(false)}
                executingActionId={executingActionId}
              />
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <ActionConfirmationModal
        open={confirmModal.open}
        action={confirmModal.action}
        onConfirm={handleActionConfirmed}
        onCancel={handleActionCancelled}
      />

      {/* Toast Notifications */}
      <Snackbar
        open={toast.open}
        autoHideDuration={5000}
        onClose={closeToast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={closeToast}
          severity={toast.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </>
  );
}
