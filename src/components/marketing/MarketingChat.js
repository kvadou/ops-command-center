import React, { useState, useEffect, useRef, useMemo } from 'react';
import DOMPurify from 'dompurify';
import {
  PaperAirplaneIcon,
  SparklesIcon,
  UserIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { SparklesIcon as SparklesSolid } from '@heroicons/react/24/solid';
import { marked } from 'marked';

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

/**
 * MarketingChat - AI Chat interface for Marketing Command Center
 *
 * Features:
 * - Real-time chat with Claude AI
 * - Message history display
 * - Suggested questions
 * - Action recommendation highlighting
 * - Typing indicator
 */
export default function MarketingChat({
  conversationId: initialConversationId = null,
  onConversationCreated,
  onNewPendingActions,
  className = '',
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Load conversation history if we have an ID, or reset for new chat
  useEffect(() => {
    if (initialConversationId) {
      loadConversation(initialConversationId);
    } else {
      // Reset state for new conversation
      setMessages([]);
      setConversationId(null);
      setError(null);
      loadSuggestions();
    }
  }, [initialConversationId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversation = async (convId) => {
    try {
      const res = await fetch(`/api/marketing-command-center/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setConversationId(convId);
      }
    } catch (err) {
      console.error('Error loading conversation:', err);
    }
  };

  const loadSuggestions = async () => {
    try {
      const res = await fetch('/api/marketing-command-center/suggestions');
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data);
      }
    } catch (err) {
      console.error('Error loading suggestions:', err);
    }
  };

  const sendMessage = async (messageText = input) => {
    if (!messageText.trim() || isLoading) return;

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: messageText.trim(),
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/marketing-command-center/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          message: messageText.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to send message');
      }

      const data = await res.json();

      // Handle error response
      if (data.success === false) {
        throw new Error(data.error || 'Failed to get response');
      }

      // Update conversation ID if this was a new conversation
      if (!conversationId && data.conversation_id) {
        setConversationId(data.conversation_id);
        onConversationCreated?.(data.conversation_id);
      }

      // Build assistant message
      const assistantMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: data.response,
        created_at: new Date().toISOString(),
        metadata: data.metadata,
        pendingActions: data.pendingActions || [],
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Notify parent of new pending actions
      if (data.pendingActions && data.pendingActions.length > 0) {
        onNewPendingActions?.(data.pendingActions);
      }

      // Clear suggestions after first message
      setSuggestions([]);
    } catch (err) {
      console.error('Error sending message:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSuggestionClick = (suggestion) => {
    sendMessage(suggestion);
  };

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Welcome message if no messages */}
        {messages.length === 0 && !isLoading && (
          <WelcomeMessage />
        )}

        {/* Message list */}
        {messages.map((message, index) => (
          <ChatMessage
            key={message.id || index}
            message={message}
          />
        ))}

        {/* Loading indicator */}
        {isLoading && <TypingIndicator />}

        {/* Error message */}
        {error && (
          <div className="flex justify-center">
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-600 flex items-center gap-2">
              <ExclamationTriangleIcon className="h-4 w-4" />
              {error}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && messages.length === 0 && (
        <div className="px-4 pb-2">
          <p className="text-xs text-neutral-500 mb-2">Suggested questions:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleSuggestionClick(suggestion)}
                disabled={isLoading}
                className="px-3 py-1.5 text-sm bg-brand-navy/5 hover:bg-brand-navy/10
                         text-brand-navy rounded-full transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-neutral-200 p-4 bg-white">
        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about marketing performance, campaigns, or recommendations..."
              disabled={isLoading}
              rows={1}
              className="w-full px-4 py-3 pr-12 border border-neutral-200 rounded-xl
                       focus:outline-none focus:ring-2 focus:ring-brand-navy/30 focus:border-brand-navy
                       resize-none disabled:bg-neutral-50 disabled:cursor-not-allowed
                       text-sm"
              style={{ minHeight: '48px', maxHeight: '120px' }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
            />
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            className="p-3 bg-brand-navy text-white rounded-xl
                     hover:bg-primary-600 transition-colors
                     disabled:bg-neutral-300 disabled:cursor-not-allowed
                     flex-shrink-0"
          >
            {isLoading ? (
              <ArrowPathIcon className="h-5 w-5 animate-spin" />
            ) : (
              <PaperAirplaneIcon className="h-5 w-5" />
            )}
          </button>
        </div>
        <p className="text-xs text-neutral-400 mt-2 text-center">
          AI Marketing Advisor powered by Claude
        </p>
      </div>
    </div>
  );
}

/**
 * Welcome message with introduction
 */
function WelcomeMessage() {
  return (
    <div className="text-center py-8">
      {/* AI Avatar */}
      <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-brand-navy to-brand-purple
                    flex items-center justify-center shadow-lg">
        <SparklesSolid className="h-10 w-10 text-white" />
      </div>

      <h3 className="text-xl font-bold text-neutral-900 mb-2">
        Marketing Command Center
      </h3>
      <p className="text-neutral-600 max-w-md mx-auto mb-4">
        Your AI marketing advisor. I analyze your campaigns, track performance,
        and provide data-driven recommendations to optimize your marketing spend.
      </p>

      <div className="flex items-center justify-center gap-2 text-sm text-emerald-700">
        <SparklesSolid className="h-4 w-4" />
        <span>Ask me anything about your marketing performance</span>
      </div>

      <div className="mt-6 max-w-sm mx-auto bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        <p className="text-sm text-amber-800">
          <strong>Note:</strong> Marketing budget is currently paused.
          I can help with restart strategies and optimization plans.
        </p>
      </div>
    </div>
  );
}

/**
 * Individual chat message component
 */
function ChatMessage({ message }) {
  const isUser = message.role === 'user';
  const metadata = message.metadata || {};
  const pendingActions = message.pendingActions || [];

  // Parse markdown for assistant messages, removing action tags for clean display
  const renderedContent = useMemo(() => {
    if (isUser) return null;

    // Remove action tags from display (they're shown separately)
    let cleanContent = message.content || '';
    cleanContent = cleanContent.replace(/\[ACTION:[^\]]+\]/g, '');

    return marked.parse(cleanContent);
  }, [message.content, isUser]);

  // Extract action tags for highlighting
  const actionMatches = useMemo(() => {
    if (isUser) return [];
    const regex = /\[ACTION:\s*(\w+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^\]]+)\]/g;
    const matches = [];
    let match;
    while ((match = regex.exec(message.content || '')) !== null) {
      matches.push({
        type: match[1],
        platform: match[2].trim(),
        targetId: match[3].trim(),
        targetName: match[4].trim(),
        reasoning: match[5].trim(),
      });
    }
    return matches;
  }, [message.content, isUser]);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] ${isUser ? 'order-2' : 'order-1'}`}>
        <div className="flex items-start gap-2">
          {/* Avatar */}
          {!isUser && (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-navy to-brand-purple
                          flex items-center justify-center flex-shrink-0 shadow-sm">
              <SparklesIcon className="h-4 w-4 text-white" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            {/* Message bubble */}
            <div className={`
              px-4 py-3 rounded-2xl
              ${isUser
                ? 'bg-brand-navy text-white rounded-br-md'
                : 'bg-neutral-100 text-neutral-800 rounded-bl-md'
              }
            `}>
              {isUser ? (
                <div className="text-sm whitespace-pre-wrap leading-relaxed">
                  {message.content}
                </div>
              ) : (
                <div
                  className="text-sm leading-relaxed prose prose-sm prose-slate max-w-none
                    prose-headings:font-semibold prose-headings:text-neutral-900 prose-headings:mt-3 prose-headings:mb-2
                    prose-h2:text-base prose-h3:text-sm
                    prose-p:my-2 prose-p:text-neutral-700
                    prose-ul:my-2 prose-ul:pl-4 prose-li:my-0.5
                    prose-strong:text-neutral-900 prose-strong:font-semibold
                    first:prose-headings:mt-0"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderedContent) }}
                />
              )}
            </div>

            {/* Action recommendations */}
            {actionMatches.length > 0 && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-neutral-500 font-medium">Recommended Actions:</p>
                {actionMatches.map((action, index) => (
                  <ActionCard key={index} action={action} />
                ))}
              </div>
            )}

            {/* Pending actions indicator */}
            {pendingActions.length > 0 && (
              <div className="mt-2 flex items-center gap-2 text-xs text-amber-600">
                <CheckCircleIcon className="h-4 w-4" />
                {pendingActions.length} action{pendingActions.length > 1 ? 's' : ''} pending approval
              </div>
            )}

            {/* Timestamp */}
            <p className={`text-xs mt-1 ${isUser ? 'text-right' : 'text-left'} text-neutral-400`}>
              {new Date(message.created_at).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit'
              })}
            </p>
          </div>

          {/* User avatar */}
          {isUser && (
            <div className="w-8 h-8 rounded-full bg-neutral-200
                          flex items-center justify-center flex-shrink-0">
              <UserIcon className="h-4 w-4 text-neutral-500" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Action recommendation card
 */
function ActionCard({ action }) {
  const platformColors = {
    meta: 'bg-blue-50 border-blue-200 text-blue-800',
    google: 'bg-green-50 border-green-200 text-green-800',
    klaviyo: 'bg-purple-50 border-purple-200 text-purple-800',
  };

  const colorClass = platformColors[action.platform.toLowerCase()] || 'bg-neutral-50 border-neutral-200 text-neutral-800';

  return (
    <div className={`rounded-lg border px-3 py-2 ${colorClass}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-xs uppercase">{action.type.replace('_', ' ')}</span>
          <span className="text-xs opacity-75">on {action.platform.toUpperCase()}</span>
        </div>
      </div>
      <p className="text-xs mt-1 font-medium">{action.targetName}</p>
      <p className="text-xs mt-0.5 opacity-75">{action.reasoning}</p>
    </div>
  );
}

/**
 * Typing indicator when AI is responding
 */
function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-navy to-brand-purple
                      flex items-center justify-center flex-shrink-0 shadow-sm">
          <SparklesIcon className="h-4 w-4 text-white" />
        </div>
        <div className="bg-neutral-100 rounded-2xl rounded-bl-md px-4 py-3">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce"
                 style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce"
                 style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce"
                 style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
