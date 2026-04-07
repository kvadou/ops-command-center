import React, { useState, useEffect, useCallback } from 'react';
import MarketingChat from './MarketingChat';
import MarketingCommandSidebar from './MarketingCommandSidebar';
import PendingActionsQueue from './PendingActionsQueue';
import ActionConfirmationModal from './ActionConfirmationModal';
import MarketingAnalyticsDashboard from './MarketingAnalyticsDashboard';
import MarketingABTests from './MarketingABTests';
import MarketingCampaignDrafts from './MarketingCampaignDrafts';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import {
  SparklesIcon,
  ClockIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  BeakerIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

/**
 * MarketingCommandCenter - Main page for AI marketing advisor
 *
 * Three-panel layout:
 * - Left: Conversation list + insights
 * - Center: Chat interface
 * - Right: Pending actions queue
 */
export default function MarketingCommandCenter() {
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [pendingActions, setPendingActions] = useState([]);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showActionsPanel, setShowActionsPanel] = useState(false);

  // View state: 'chat' or 'analytics'
  const [activeView, setActiveView] = useState('chat');

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
    loadInsights();
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

  const loadInsights = async () => {
    try {
      const res = await fetch('/api/marketing-command-center/insights-summary');
      if (res.ok) {
        const data = await res.json();
        setInsights(data);
      }
    } catch (err) {
      console.error('Error loading insights:', err);
    }
  };

  const handleNewConversation = useCallback(() => {
    setActiveConversationId(null);
  }, []);

  const handleSelectConversation = useCallback((id) => {
    setActiveConversationId(id);
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
    <div className="flex bg-neutral-50" style={{ height: 'calc(100vh - 64px)' }}>
      {/* Left Panel - Conversations & Insights */}
      <div className="w-72 flex-shrink-0 border-r border-neutral-200 bg-white hidden lg:flex lg:flex-col">
        <MarketingCommandSidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          insights={insights}
          loading={loading}
          onNewConversation={handleNewConversation}
          onSelectConversation={handleSelectConversation}
        />
      </div>

      {/* Center Panel - Chat or Analytics */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header with view tabs */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-200 bg-white">
          {/* View Tabs */}
          <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-1">
            <button
              onClick={() => setActiveView('chat')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeView === 'chat'
                  ? 'bg-white text-brand-navy shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <ChatBubbleLeftRightIcon className="h-4 w-4" />
              <span className="hidden sm:inline">AI Chat</span>
            </button>
            <button
              onClick={() => setActiveView('analytics')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeView === 'analytics'
                  ? 'bg-white text-brand-navy shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <ChartBarIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Analytics</span>
            </button>
            <button
              onClick={() => setActiveView('drafts')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeView === 'drafts'
                  ? 'bg-white text-brand-navy shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <DocumentTextIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Drafts</span>
            </button>
            <button
              onClick={() => setActiveView('ab-tests')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeView === 'ab-tests'
                  ? 'bg-white text-brand-navy shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <BeakerIcon className="h-4 w-4" />
              <span className="hidden sm:inline">A/B Tests</span>
            </button>
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-2">
            {activeView === 'chat' && (
              <button
                onClick={() => setShowActionsPanel(!showActionsPanel)}
                className={`p-2 rounded-lg transition-colors relative ${
                  showActionsPanel ? 'bg-brand-navy/10 text-brand-navy' : 'text-neutral-500 hover:bg-neutral-100'
                }`}
              >
                <ClockIcon className="h-5 w-5" />
                {pendingActions.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-xs rounded-full flex items-center justify-center">
                    {pendingActions.length}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        {activeView === 'chat' && (
          <MarketingChat
            conversationId={activeConversationId}
            onConversationCreated={handleConversationCreated}
            onNewPendingActions={handleNewPendingActions}
            className="flex-1"
          />
        )}
        {activeView === 'analytics' && (
          <div className="flex-1 overflow-y-auto bg-neutral-50">
            <MarketingAnalyticsDashboard />
          </div>
        )}
        {activeView === 'drafts' && (
          <div className="flex-1 overflow-y-auto bg-neutral-50">
            <MarketingCampaignDrafts />
          </div>
        )}
        {activeView === 'ab-tests' && (
          <div className="flex-1 overflow-y-auto bg-neutral-50">
            <MarketingABTests />
          </div>
        )}
      </div>

      {/* Right Panel - Pending Actions (only show in chat view) */}
      {activeView === 'chat' && (showActionsPanel || pendingActions.length > 0) && (
        <div className={`
          ${showActionsPanel ? 'fixed inset-0 z-50 lg:relative lg:inset-auto' : 'hidden lg:flex'}
          lg:w-80 lg:flex-shrink-0 lg:border-l lg:border-neutral-200 lg:bg-white
        `}>
          {/* Mobile overlay background */}
          <div
            className="lg:hidden absolute inset-0 bg-black/30"
            onClick={() => setShowActionsPanel(false)}
          />

          {/* Actions panel */}
          <div className="absolute right-0 top-0 bottom-0 w-80 bg-white shadow-lg lg:shadow-none lg:relative lg:w-full">
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
    </div>
  );
}
