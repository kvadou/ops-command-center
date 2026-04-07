import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCompanyName } from '../../contexts/CompanyNameContext';
import {
  ChatBubbleLeftRightIcon,
  ClockIcon,
  TrashIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import FranchiseAcademyLayout from '../../components/academy/layout/FranchiseAcademyLayout';
import AcademySidebar from '../../components/academy/layout/AcademySidebar';
import CoachChat from '../../components/academy/coach/CoachChat';

/**
 * CoachPage - AI Coach interface with Earl the Squirrel
 *
 * Earl the Squirrel is the wise mentor who teaches the knights their
 * "gallop-gallop-step to the side" movement and helps with strategy.
 *
 * Features:
 * - Full chat interface with Earl
 * - Conversation history sidebar
 * - New conversation creation
 * - Progress-aware coaching
 */
export default function CoachPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const { isMainBranch } = useCompanyName();
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [progressRes, conversationsRes] = await Promise.all([
        fetch('/api/academy/progress'),
        fetch('/api/academy/coach/conversations'),
      ]);

      if (progressRes.ok) {
        const data = await progressRes.json();
        setProgress(data);
      }

      if (conversationsRes.ok) {
        const data = await conversationsRes.json();
        setConversations(data);
      }
    } catch (error) {
      console.error('Error fetching coach data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNewConversation = () => {
    setActiveConversationId(null);
    setShowHistory(false);
  };

  const handleSelectConversation = (convId) => {
    setActiveConversationId(convId);
    setShowHistory(false);
  };

  const handleConversationCreated = (convId) => {
    setActiveConversationId(convId);
    // Refresh conversations list
    fetch('/api/academy/coach/conversations')
      .then(res => res.json())
      .then(data => setConversations(data))
      .catch(console.error);
  };

  if (loading) {
    return (
      <FranchiseAcademyLayout
        sidebar={<AcademySidebar isMainBranch={isMainBranch} />}
        progress={0}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-brand-navy/20 border-t-brand-navy" />
            <p className="text-neutral-500 font-medium">Loading Coach...</p>
          </div>
        </div>
      </FranchiseAcademyLayout>
    );
  }

  return (
    <FranchiseAcademyLayout
      sidebar={
        <AcademySidebar
          isMainBranch={isMainBranch}
          currentPoints={progress?.total_points || 0}
          currentStreak={progress?.current_streak_days || 0}
          badgesEarned={progress?.badges_earned || 0}
        />
      }
      progress={progress?.completion_percentage || 0}
    >
      <div className="flex flex-col h-[calc(100vh-180px)] min-h-[500px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-3">
              <img
                src="/images/academy/earl-the-squirrel.png"
                alt="Earl the Squirrel"
                className="w-10 h-10 object-contain"
              />
              Ask Earl
            </h1>
            <p className="text-neutral-600 mt-1">
              Your wise franchise coach - ask anything about running your business
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* History toggle for mobile */}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="lg:hidden p-2 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
            >
              <ClockIcon className="h-5 w-5" />
            </button>

            {/* New conversation button */}
            <button
              onClick={handleNewConversation}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-navy text-white
                       font-medium rounded-lg hover:bg-primary-600 transition-colors shadow-sm"
            >
              <PlusIcon className="h-4 w-4" />
              <span className="hidden sm:inline">New Chat</span>
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex gap-4 overflow-hidden">
          {/* Conversation History Sidebar - Desktop */}
          <div className="hidden lg:flex flex-col w-64 bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            <div className="p-3 border-b border-neutral-100">
              <h3 className="text-sm font-semibold text-neutral-700">Recent Conversations</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {conversations.length === 0 ? (
                <p className="text-xs text-neutral-400 text-center py-4">
                  No conversations yet
                </p>
              ) : (
                <div className="space-y-1">
                  {conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv.id)}
                      className={`
                        w-full text-left p-2.5 rounded-lg transition-colors
                        ${activeConversationId === conv.id
                          ? 'bg-brand-navy/10 text-brand-navy'
                          : 'hover:bg-neutral-50 text-neutral-700'
                        }
                      `}
                    >
                      <div className="flex items-start gap-2">
                        <ChatBubbleLeftRightIcon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${
                          activeConversationId === conv.id ? 'text-brand-navy' : 'text-neutral-400'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {conv.title || 'New conversation'}
                          </p>
                          <p className="text-xs text-neutral-400 mt-0.5">
                            {new Date(conv.updated_at || conv.created_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Mobile History Panel */}
          {showHistory && (
            <div className="lg:hidden absolute inset-x-4 top-48 bg-white rounded-xl border border-neutral-200 shadow-lg z-10 max-h-64 overflow-y-auto">
              <div className="p-3 border-b border-neutral-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-neutral-700">Recent Conversations</h3>
                <button
                  onClick={() => setShowHistory(false)}
                  className="text-neutral-400 hover:text-neutral-600"
                >
                  &times;
                </button>
              </div>
              <div className="p-2">
                {conversations.length === 0 ? (
                  <p className="text-xs text-neutral-400 text-center py-4">
                    No conversations yet
                  </p>
                ) : (
                  <div className="space-y-1">
                    {conversations.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => handleSelectConversation(conv.id)}
                        className="w-full text-left p-2.5 rounded-lg hover:bg-neutral-50 text-neutral-700"
                      >
                        <div className="flex items-start gap-2">
                          <ChatBubbleLeftRightIcon className="h-4 w-4 text-neutral-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {conv.title || 'New conversation'}
                            </p>
                            <p className="text-xs text-neutral-400 mt-0.5">
                              {new Date(conv.updated_at || conv.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Chat Area */}
          <div className="flex-1 bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden flex flex-col">
            <CoachChat
              conversationId={activeConversationId}
              onConversationCreated={handleConversationCreated}
              className="flex-1"
            />
          </div>
        </div>

        {/* Quick Tips */}
        <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <img
              src="/images/academy/earl-the-squirrel.png"
              alt="Earl"
              className="w-8 h-8 object-contain flex-shrink-0"
            />
            <div>
              <p className="text-sm font-medium text-emerald-800">Tips for asking Earl</p>
              <ul className="text-xs text-emerald-700 mt-1 space-y-1">
                <li>• Ask specific questions for the best answers</li>
                <li>• Reference your current phase for context-aware help</li>
                <li>• Earl can help with marketing, operations, hiring, and more</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </FranchiseAcademyLayout>
  );
}
