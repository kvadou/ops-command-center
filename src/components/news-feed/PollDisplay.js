/**
 * PollDisplay - Poll voting and results component
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ChartBarIcon,
  CheckIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

const PollDisplay = ({ postId, pollData, currentUserId }) => {
  const [userVotes, setUserVotes] = useState([]);
  const [voteCounts, setVoteCounts] = useState({});
  const [totalVoters, setTotalVoters] = useState(0);
  const [hasVoted, setHasVoted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Parse poll data
  const options = pollData?.options || [];
  const question = pollData?.question || '';
  const multipleChoice = pollData?.multiple_choice || false;
  const endsAt = pollData?.ends_at ? new Date(pollData.ends_at) : null;
  const isExpired = endsAt && new Date() > endsAt;

  // Fetch poll results
  const fetchResults = useCallback(async () => {
    try {
      const response = await fetch(`/api/news-feed/posts/${postId}/poll-results`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        
        // Convert vote counts to object
        const counts = {};
        (data.vote_counts || []).forEach(v => {
          counts[v.option_index] = parseInt(v.count);
        });
        setVoteCounts(counts);
        setTotalVoters(data.total_voters || 0);
        setUserVotes(data.user_votes || []);
        setHasVoted(data.user_votes?.length > 0);
      }
    } catch (error) {
      console.error('Error fetching poll results:', error);
    }
  }, [postId]);

  // Initial fetch
  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  // Submit vote
  const handleVote = async (optionIndex) => {
    if (loading || isExpired) return;

    // For single choice, prevent re-voting
    if (!multipleChoice && hasVoted) return;

    // For multiple choice, toggle the selection
    if (multipleChoice && userVotes.includes(optionIndex)) {
      // In a real app, you'd need an endpoint to remove votes
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/news-feed/posts/${postId}/vote`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ option_index: optionIndex })
      });

      if (response.ok) {
        const data = await response.json();
        
        // Update state with new results
        const counts = {};
        (data.vote_counts || []).forEach(v => {
          counts[v.option_index] = parseInt(v.count);
        });
        setVoteCounts(counts);
        setUserVotes(data.user_votes || []);
        setHasVoted(true);
        setShowResults(true);
        
        // Recalculate total
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        setTotalVoters(Math.ceil(total / (multipleChoice ? options.length : 1)));
      }
    } catch (error) {
      console.error('Error voting:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate percentage for an option
  const getPercentage = (optionIndex) => {
    const totalVotes = Object.values(voteCounts).reduce((a, b) => a + b, 0);
    if (totalVotes === 0) return 0;
    return Math.round((voteCounts[optionIndex] || 0) / totalVotes * 100);
  };

  // Format time remaining
  const formatTimeRemaining = () => {
    if (!endsAt) return null;
    if (isExpired) return 'Poll ended';

    const now = new Date();
    const diffMs = endsAt - now;
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} left`;
    if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} left`;
    return 'Less than an hour left';
  };

  // Determine if we should show results
  const shouldShowResults = showResults || hasVoted || isExpired;

  return (
    <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
      {/* Question */}
      <div className="flex items-start gap-2 mb-4">
        <ChartBarIcon className="h-5 w-5 text-brand-purple flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-semibold text-neutral-900">{question}</h4>
          {multipleChoice && (
            <p className="text-xs text-neutral-500 mt-0.5">Select all that apply</p>
          )}
        </div>
      </div>

      {/* Options */}
      <div className="space-y-2">
        {options.map((option, index) => {
          const percentage = getPercentage(index);
          const isSelected = userVotes.includes(index);
          const voteCount = voteCounts[index] || 0;

          return (
            <button
              key={index}
              onClick={() => handleVote(index)}
              disabled={loading || (hasVoted && !multipleChoice) || isExpired}
              className={`
                w-full text-left relative rounded-lg overflow-hidden transition-all
                ${shouldShowResults 
                  ? 'cursor-default' 
                  : 'hover:bg-neutral-100 cursor-pointer'
                }
                ${isSelected ? 'ring-2 ring-brand-purple' : 'ring-1 ring-neutral-200'}
              `}
            >
              {/* Progress Bar Background (when showing results) */}
              {shouldShowResults && (
                <div
                  className={`absolute inset-0 transition-all duration-500 ${
                    isSelected ? 'bg-brand-purple/20' : 'bg-neutral-200'
                  }`}
                  style={{ width: `${percentage}%` }}
                />
              )}

              {/* Option Content */}
              <div className="relative flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  {shouldShowResults && isSelected && (
                    <CheckIcon className="h-4 w-4 text-brand-purple" />
                  )}
                  <span className={`text-sm ${isSelected ? 'font-medium text-brand-purple' : 'text-neutral-700'}`}>
                    {option}
                  </span>
                </div>
                
                {shouldShowResults && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-700">
                      {percentage}%
                    </span>
                    <span className="text-xs text-neutral-500">
                      ({voteCount})
                    </span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 text-xs text-neutral-500">
        <span>
          {totalVoters} vote{totalVoters !== 1 ? 's' : ''}
        </span>
        {endsAt && (
          <span className="flex items-center gap-1">
            <ClockIcon className="h-3 w-3" />
            {formatTimeRemaining()}
          </span>
        )}
        {!shouldShowResults && !hasVoted && !isExpired && (
          <button
            onClick={() => setShowResults(true)}
            className="text-brand-purple hover:text-brand-navy"
          >
            View results
          </button>
        )}
      </div>
    </div>
  );
};

export default PollDisplay;

