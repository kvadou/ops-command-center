import React, { useState, useEffect, useRef, useMemo } from 'react';
import DOMPurify from 'dompurify';
import {
  PaperAirplaneIcon,
  SparklesIcon,
  UserIcon,
  DocumentTextIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { SparklesIcon as SparklesSolid } from '@heroicons/react/24/solid';
import { marked } from 'marked';

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

/**
 * CoachChat - AI Coach chat interface with Earl the Squirrel persona
 *
 * Earl the Squirrel is the wise mentor who teaches the knights their
 * "gallop-gallop-step to the side" movement and helps with strategy.
 *
 * Features:
 * - Real-time chat with streaming appearance
 * - Message history display
 * - Suggested questions
 * - Citation display for referenced documents
 * - Typing indicator
 */
export default function CoachChat({
  conversationId: initialConversationId = null,
  onConversationCreated,
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
      const res = await fetch(`/api/academy/coach/conversations/${convId}`);
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
      const res = await fetch('/api/academy/coach/suggestions');
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
      const res = await fetch('/api/academy/coach/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          message: messageText.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to send message');
      }

      const data = await res.json();

      // Handle error response from coach service
      if (data.success === false) {
        throw new Error(data.error || 'Failed to get response from Earl');
      }

      // Update conversation ID if this was a new conversation
      if (!conversationId && data.conversation_id) {
        setConversationId(data.conversation_id);
        onConversationCreated?.(data.conversation_id);
      }

      // Build assistant message object from response
      const assistantMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: data.response,
        created_at: new Date().toISOString(),
        metadata: {
          citations: data.citations || [],
          ...data.metadata
        }
      };

      // Add assistant response
      setMessages(prev => [...prev, assistantMessage]);

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
    <div className={`flex flex-col h-full ${className}`}>
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
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-600">
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
              placeholder="Ask Earl anything about your franchise..."
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
          Earl the Squirrel uses AI to provide guidance based on Acme Operations resources
        </p>
      </div>
    </div>
  );
}

/**
 * Welcome message with Earl the Squirrel introduction
 */
function WelcomeMessage() {
  return (
    <div className="text-center py-8">
      {/* Earl the Squirrel Avatar */}
      <div className="w-24 h-24 mx-auto mb-4">
        <img
          src="/images/academy/earl-the-squirrel.png"
          alt="Earl the Squirrel"
          className="w-full h-full object-contain"
        />
      </div>

      <h3 className="text-xl font-bold text-neutral-900 mb-2">
        Hi! I'm Earl the Squirrel
      </h3>
      <p className="text-neutral-600 max-w-md mx-auto mb-4">
        Your wise franchise coach! Just like I teach the knights their famous
        "gallop-gallop-step to the side" dance, I'm here to guide you step-by-step
        through your franchise journey.
      </p>

      <div className="flex items-center justify-center gap-2 text-sm text-emerald-700">
        <SparklesSolid className="h-4 w-4" />
        <span>Ask me anything about running your franchise</span>
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
  const citations = metadata.citations || [];

  // Parse markdown for assistant messages
  const renderedContent = useMemo(() => {
    if (isUser) return null;
    return marked.parse(message.content || '');
  }, [message.content, isUser]);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] ${isUser ? 'order-2' : 'order-1'}`}>
        <div className="flex items-start gap-2">
          {/* Avatar */}
          {!isUser && (
            <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden">
              <img
                src="/images/academy/earl-the-squirrel.png"
                alt="Earl"
                className="w-7 h-7 object-contain"
              />
            </div>
          )}

          <div>
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

            {/* Citations - clickable links to resource pages */}
            {citations.length > 0 && (
              <div className="mt-2 pl-2">
                <p className="text-xs text-neutral-400 mb-1">Sources:</p>
                <div className="flex flex-wrap gap-1">
                  {citations.map((citation, index) => (
                    <a
                      key={index}
                      href={citation.id ? `/academy/resources/${citation.id}` : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5
                               bg-neutral-50 border border-neutral-200 rounded-full
                               text-xs text-neutral-600 hover:bg-brand-navy/10
                               hover:border-brand-navy/30 hover:text-brand-navy
                               transition-colors cursor-pointer"
                    >
                      <DocumentTextIcon className="h-3 w-3" />
                      {citation.title || citation}
                    </a>
                  ))}
                </div>
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
 * Typing indicator when AI is responding
 */
function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden">
          <img
            src="/images/academy/earl-the-squirrel.png"
            alt="Earl"
            className="w-7 h-7 object-contain"
          />
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
