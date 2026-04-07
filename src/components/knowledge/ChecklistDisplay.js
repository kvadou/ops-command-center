import { useState, useEffect } from 'react';
import {
  CheckCircleIcon as CheckCircleOutline,
  InformationCircleIcon,
  LinkIcon,
  ClockIcon,
  ChatBubbleLeftIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid';
import { useToast } from '../../hooks/useToast';

/**
 * ChecklistDisplay - Interactive checklist for franchisees
 * Shows checklist items and allows them to mark items as complete
 * Progress is saved to production database with franchise scope
 */
export default function ChecklistDisplay({ articleId, isMainBranch = false }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null); // Track which item is being updated
  const [franchiseId, setFranchiseId] = useState('');
  const [expandedNotes, setExpandedNotes] = useState(null);
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    if (articleId) {
      fetchChecklist();
    }
  }, [articleId]);

  const fetchChecklist = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/knowledge/articles/${articleId}/checklist`, {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setItems(data.checklist_items || []);
        setFranchiseId(data.franchise_id || '');
      }
    } catch (error) {
      console.error('Error fetching checklist:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleComplete = async (item) => {
    if (isMainBranch) {
      // HQ users can view but not complete checklist items
      return;
    }

    try {
      setUpdating(item.id);
      const response = await fetch(`/api/knowledge/checklist-items/${item.id}/progress`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          is_completed: !item.is_completed,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setItems(items.map(i => 
          i.id === item.id 
            ? { 
                ...i, 
                is_completed: data.progress.is_completed,
                completed_at: data.progress.completed_at,
                completed_by_name: data.progress.completed_by_name,
              }
            : i
        ));
      } else {
        throw new Error('Failed to update progress');
      }
    } catch (error) {
      console.error('Error updating progress:', error);
      toast.error('Failed to update progress. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const handleSaveNotes = async (item) => {
    try {
      setUpdating(item.id);
      const response = await fetch(`/api/knowledge/checklist-items/${item.id}/progress`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          is_completed: item.is_completed,
          notes: noteText,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setItems(items.map(i => 
          i.id === item.id 
            ? { ...i, progress_notes: data.progress.notes }
            : i
        ));
        setExpandedNotes(null);
        setNoteText('');
      } else {
        throw new Error('Failed to save notes');
      }
    } catch (error) {
      console.error('Error saving notes:', error);
      toast.error('Failed to save notes. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const completedCount = items.filter(i => i.is_completed).length;
  const totalCount = items.length;
  const progressPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200 p-6">
        <p className="text-neutral-500 text-center">Loading checklist...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return null; // Don't show anything if no checklist items
  }

  return (
    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
      {/* Header with Progress */}
      <div className="bg-gradient-to-r from-brand-purple to-brand-navy px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <CheckCircleSolid className="h-6 w-6" />
              Onboarding Checklist
            </h3>
            <p className="text-blue-100 text-sm mt-1">
              {isMainBranch 
                ? 'View-only mode (franchisee progress shown below)'
                : 'Complete these steps to finish your onboarding'
              }
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-white">{progressPercentage}%</div>
            <p className="text-blue-100 text-sm">{completedCount} of {totalCount} complete</p>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="mt-4 bg-white/20 rounded-full h-3 overflow-hidden">
          <div 
            className="h-full bg-green-400 rounded-full transition-all duration-500"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Checklist Items */}
      <div className="divide-y divide-neutral-100">
        {items.map((item) => (
          <div
            key={item.id}
            className={`p-4 transition-colors ${
              item.is_completed ? 'bg-green-50/50' : 'hover:bg-neutral-50'
            }`}
          >
            <div className="flex items-start gap-4">
              {/* Checkbox */}
              <button
                onClick={() => handleToggleComplete(item)}
                disabled={isMainBranch || updating === item.id}
                className={`flex-shrink-0 mt-0.5 ${
                  isMainBranch 
                    ? 'cursor-default' 
                    : 'cursor-pointer hover:scale-110 transition-transform'
                } ${updating === item.id ? 'opacity-50' : ''}`}
              >
                {item.is_completed ? (
                  <CheckCircleSolid className="h-6 w-6 text-green-500" />
                ) : (
                  <div className="h-6 w-6 rounded-full border-2 border-neutral-300 hover:border-brand-purple transition-colors" />
                )}
              </button>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-medium ${
                    item.is_completed ? 'text-neutral-500 line-through' : 'text-neutral-900'
                  }`}>
                    {item.title}
                  </span>
                  {item.is_required && !item.is_completed && (
                    <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">
                      Required
                    </span>
                  )}
                  {item.category && (
                    <span className="text-xs px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded">
                      {item.category}
                    </span>
                  )}
                </div>

                {item.description && (
                  <p className={`text-sm mt-1 ${
                    item.is_completed ? 'text-neutral-400' : 'text-neutral-600'
                  }`}>
                    {item.description}
                  </p>
                )}

                {/* Help Text */}
                {item.help_text && (
                  <p className="text-sm text-blue-600 mt-2 flex items-center gap-1">
                    <InformationCircleIcon className="h-4 w-4 flex-shrink-0" />
                    {item.help_text}
                  </p>
                )}

                {/* Help Link */}
                {item.help_link && (
                  <a
                    href={item.help_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-brand-purple hover:underline mt-2"
                  >
                    <LinkIcon className="h-4 w-4" />
                    View Resource
                  </a>
                )}

                {/* Completion Info */}
                {item.is_completed && item.completed_at && (
                  <p className="text-xs text-neutral-400 mt-2 flex items-center gap-1">
                    <ClockIcon className="h-3 w-3" />
                    Completed {new Date(item.completed_at).toLocaleDateString()} 
                    {item.completed_by_name && ` by ${item.completed_by_name}`}
                  </p>
                )}

                {/* Notes */}
                {item.progress_notes && (
                  <div className="mt-2 p-2 bg-yellow-50 rounded text-sm text-neutral-700">
                    <span className="font-medium text-yellow-700">Note: </span>
                    {item.progress_notes}
                  </div>
                )}

                {/* Add/Edit Notes (only for franchisees) */}
                {!isMainBranch && (
                  <div className="mt-2">
                    {expandedNotes === item.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          placeholder="Add a note about this step..."
                          rows={2}
                          className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-brand-purple focus:border-brand-purple"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveNotes(item)}
                            disabled={updating === item.id}
                            className="px-3 py-1 text-xs bg-brand-purple text-white rounded hover:bg-brand-navy transition-colors"
                          >
                            Save Note
                          </button>
                          <button
                            onClick={() => {
                              setExpandedNotes(null);
                              setNoteText('');
                            }}
                            className="px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-100 rounded transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setExpandedNotes(item.id);
                          setNoteText(item.progress_notes || '');
                        }}
                        className="text-xs text-neutral-500 hover:text-brand-purple flex items-center gap-1"
                      >
                        <ChatBubbleLeftIcon className="h-3 w-3" />
                        {item.progress_notes ? 'Edit note' : 'Add note'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Due Date */}
              {item.due_days && !item.is_completed && (
                <div className="text-right text-sm">
                  <span className="text-neutral-500">Due Day</span>
                  <div className="font-medium text-neutral-700">{item.due_days}</div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Completion Message */}
      {progressPercentage === 100 && (
        <div className="p-6 bg-green-50 border-t border-green-100 text-center">
          <CheckCircleSolid className="h-12 w-12 text-green-500 mx-auto mb-2" />
          <h4 className="text-lg font-semibold text-green-800">Checklist Complete! 🎉</h4>
          <p className="text-green-600 text-sm mt-1">
            You've completed all the onboarding steps for this section.
          </p>
        </div>
      )}
    </div>
  );
}

