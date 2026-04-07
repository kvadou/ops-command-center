import React from 'react';
import {
  PlusIcon,
  ChatBubbleLeftRightIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import { SparklesIcon } from '@heroicons/react/24/solid';

/**
 * MarketingCommandSidebar - Conversation list and insights panel
 *
 * Shows:
 * - New conversation button
 * - Recent conversations
 * - Quick insights metrics
 */
export default function MarketingCommandSidebar({
  conversations = [],
  activeConversationId,
  loading,
  onNewConversation,
  onSelectConversation,
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-neutral-200">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-navy to-brand-purple
                        flex items-center justify-center">
            <SparklesIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-neutral-900 text-sm">Command Center</h2>
            <p className="text-xs text-neutral-500">AI Marketing Advisor</p>
          </div>
        </div>

        <button
          onClick={onNewConversation}
          className="w-full flex items-center justify-center gap-2 px-4 py-2
                   bg-brand-navy text-white rounded-lg text-sm font-medium
                   hover:bg-primary-600 transition-colors"
        >
          <PlusIcon className="h-4 w-4" />
          New Conversation
        </button>
      </div>


      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">
            Recent Conversations
          </h3>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-12 bg-neutral-100 rounded-lg" />
                </div>
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8">
              <ChatBubbleLeftRightIcon className="h-10 w-10 mx-auto text-neutral-300 mb-2" />
              <p className="text-sm text-neutral-500">No conversations yet</p>
              <p className="text-xs text-neutral-400 mt-1">
                Start a new conversation to get marketing insights
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    activeConversationId === conv.id
                      ? 'bg-brand-navy/10 text-brand-navy'
                      : 'hover:bg-neutral-100 text-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ChatBubbleLeftRightIcon className={`h-4 w-4 flex-shrink-0 ${
                      activeConversationId === conv.id ? 'text-brand-navy' : 'text-neutral-400'
                    }`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {conv.title || 'Untitled Conversation'}
                      </p>
                      <p className="text-xs text-neutral-400">
                        {formatRelativeDate(conv.updated_at)}
                        {conv.message_count > 0 && ` - ${conv.message_count} messages`}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="p-4 border-t border-neutral-200">
        <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">
          Ads Manager
        </h3>
        <div className="space-y-2">
          <QuickLink
            href="https://adsmanager.facebook.com"
            label="Meta Ads"
            color="blue"
          />
          <QuickLink
            href="https://ads.google.com"
            label="Google Ads"
            color="green"
          />
          <QuickLink
            href="https://www.klaviyo.com/campaigns"
            label="Klaviyo"
            color="purple"
          />
        </div>
      </div>

      {/* Budget Note */}
      <div className="p-4 border-t border-neutral-200 bg-amber-50">
        <p className="text-xs text-amber-800">
          <strong>Budget Status:</strong> Paused
        </p>
        <p className="text-xs text-amber-700 mt-1">
          AI can help plan restart strategies
        </p>
      </div>
    </div>
  );
}

/**
 * Quick link to external ads manager
 */
function QuickLink({ href, label, color }) {
  const colorClasses = {
    blue: 'text-blue-600 hover:bg-blue-50',
    green: 'text-green-600 hover:bg-green-50',
    purple: 'text-purple-600 hover:bg-purple-50',
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium
                ${colorClasses[color] || 'text-neutral-600 hover:bg-neutral-50'} transition-colors`}
    >
      <span>{label}</span>
      <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 opacity-50" />
    </a>
  );
}

/**
 * Format date as relative time
 */
function formatRelativeDate(dateString) {
  if (!dateString) return '';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
