import React, { useState } from 'react';
import {
  CheckCircleIcon,
  UserIcon,
  TagIcon,
  TrashIcon,
  ArrowRightIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import ConfirmationModal from '../ConfirmationModal';

export default function BulkActions({ 
  selectedTasks, 
  onDeselectAll,
  onBulkUpdate,
  availableGroups = []
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [action, setAction] = useState('');
  const [actionValue, setActionValue] = useState('');
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });

  if (selectedTasks.length === 0) {
    return null;
  }

  const handleBulkAction = () => {
    if (!action) return;

    const updates = {};
    
    switch (action) {
      case 'status':
        updates.status = actionValue;
        break;
      case 'priority':
        updates.priority = actionValue;
        break;
      case 'assignee':
        updates.assignee_id = actionValue || null;
        break;
      case 'group':
        updates.group_id = actionValue;
        break;
      case 'delete':
        // Handle delete separately
        setConfirmState({
          isOpen: true,
          title: 'Delete Tasks',
          message: `Are you sure you want to delete ${selectedTasks.length} task(s)?`,
          action: () => onBulkUpdate(selectedTasks.map(t => t.id), { deleted: true })
        });
        return;
      default:
        return;
    }

    onBulkUpdate(selectedTasks.map(t => t.id), updates);
    setIsOpen(false);
    setAction('');
    setActionValue('');
  };

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
      <div className="bg-white rounded-xl shadow-lg border border-neutral-200 p-4 min-w-[400px]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-neutral-900">
              {selectedTasks.length} task{selectedTasks.length !== 1 ? 's' : ''} selected
            </span>
          </div>
          <button
            onClick={onDeselectAll}
            className="p-1 text-neutral-500 hover:text-neutral-700"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {!isOpen ? (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                setAction('status');
                setIsOpen(true);
              }}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              <CheckCircleIcon className="h-4 w-4" />
              Change Status
            </button>
            <button
              onClick={() => {
                setAction('priority');
                setIsOpen(true);
              }}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              <TagIcon className="h-4 w-4" />
              Change Priority
            </button>
            <button
              onClick={() => {
                setAction('assignee');
                setIsOpen(true);
              }}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              <UserIcon className="h-4 w-4" />
              Assign
            </button>
            <button
              onClick={() => {
                setAction('group');
                setIsOpen(true);
              }}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              <ArrowRightIcon className="h-4 w-4" />
              Move to Group
            </button>
            <button
              onClick={() => {
                setConfirmState({
                  isOpen: true,
                  title: 'Delete Tasks',
                  message: `Are you sure you want to delete ${selectedTasks.length} task(s)?`,
                  action: () => onBulkUpdate(selectedTasks.map(t => t.id), { deleted: true })
                });
              }}
              className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
            >
              <TrashIcon className="h-4 w-4" />
              Delete
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {action === 'status' && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">New Status</label>
                <select
                  value={actionValue}
                  onChange={(e) => setActionValue(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                >
                  <option value="">Select status...</option>
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
            )}

            {action === 'priority' && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">New Priority</label>
                <select
                  value={actionValue}
                  onChange={(e) => setActionValue(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                >
                  <option value="">Select priority...</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            )}

            {action === 'assignee' && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Assign To</label>
                <input
                  type="text"
                  value={actionValue}
                  onChange={(e) => setActionValue(e.target.value)}
                  placeholder="User email or ID..."
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                />
                <p className="mt-1 text-xs text-neutral-500">Leave empty to unassign</p>
              </div>
            )}

            {action === 'group' && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Move To Group</label>
                <select
                  value={actionValue}
                  onChange={(e) => setActionValue(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                >
                  <option value="">Select group...</option>
                  {availableGroups.map(group => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsOpen(false);
                  setAction('');
                  setActionValue('');
                }}
                className="px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAction}
                disabled={!actionValue && action !== 'assignee'}
                className="px-4 py-2 text-sm bg-brand-purple text-white rounded-lg hover:bg-brand-navy disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Apply to {selectedTasks.length} task{selectedTasks.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
        onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
        title={confirmState.title}
        message={confirmState.message}
        isDestructive
      />
    </div>
  );
}
