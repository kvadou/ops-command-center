import React, { useState, useEffect } from 'react';
import { DateTime } from 'luxon';
import ConfirmationModal from '../ConfirmationModal';
import {
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

const TARGET_TYPES = [
  { value: 'weekly_lessons', label: 'Weekly Lessons' },
  { value: 'quarterly_revenue', label: 'Quarterly Revenue' },
  { value: 'monthly_revenue', label: 'Monthly Revenue' },
];

const CHANNELS = [
  { value: '', label: 'All Channels' },
  { value: 'home', label: 'Home' },
  { value: 'digital', label: 'Digital/Online' },
  { value: 'clubs', label: 'Clubs' },
  { value: 'schools', label: 'Schools' },
];

const QUARTERS = [
  { value: '', label: 'N/A (for non-quarterly)' },
  { value: '1', label: 'Q1' },
  { value: '2', label: 'Q2' },
  { value: '3', label: 'Q3' },
  { value: '4', label: 'Q4' },
];

function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

export default function TargetConfigModal({ open, onClose, targets, onSave }) {
  const [localTargets, setLocalTargets] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [newTarget, setNewTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });

  // Initialize local targets from props
  useEffect(() => {
    if (open) {
      setLocalTargets(targets || []);
      setEditingId(null);
      setNewTarget(null);
      setError(null);
    }
  }, [open, targets]);

  // Start editing a target
  const handleEdit = (target) => {
    setEditingId(target.id);
    setEditForm({
      target_type: target.target_type,
      channel: target.channel || '',
      market: target.market || '',
      target_value: target.target_value,
      quarter: target.quarter?.toString() || '',
      year: target.year,
    });
    setNewTarget(null);
  };

  // Cancel editing
  const handleCancel = () => {
    setEditingId(null);
    setEditForm({});
    setNewTarget(null);
    setError(null);
  };

  // Save edited target
  const handleSaveEdit = async () => {
    if (!editForm.target_value || !editForm.year) {
      setError('Target value and year are required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const headers = { 'Content-Type': 'application/json' };

      const response = await fetch(`/api/forecast/targets/${editingId}`, {
        method: 'PUT',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          target_value: parseFloat(editForm.target_value),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update target');
      }

      const updated = await response.json();
      setLocalTargets(prev =>
        prev.map(t => t.id === editingId ? updated : t)
      );
      setEditingId(null);
      setEditForm({});
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete target
  const handleDelete = (id) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Target',
      message: 'Are you sure you want to delete this target?',
      action: async () => {
        try {
          const response = await fetch(`/api/forecast/targets/${id}`, {
            method: 'DELETE',
            credentials: 'include',
          });

          if (!response.ok) {
            throw new Error('Failed to delete target');
          }

          setLocalTargets(prev => prev.filter(t => t.id !== id));
        } catch (err) {
          setError(err.message);
        }
      },
    });
  };

  // Start adding new target
  const handleAddNew = () => {
    setNewTarget({
      target_type: 'weekly_lessons',
      channel: '',
      market: '',
      target_value: '',
      quarter: '',
      year: DateTime.now().year,
    });
    setEditingId(null);
  };

  // Save new target
  const handleSaveNew = async () => {
    if (!newTarget.target_value || !newTarget.year) {
      setError('Target value and year are required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const headers = { 'Content-Type': 'application/json' };

      const response = await fetch('/api/forecast/targets', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          target_type: newTarget.target_type,
          channel: newTarget.channel || null,
          market: newTarget.market || null,
          target_value: parseFloat(newTarget.target_value),
          quarter: newTarget.quarter ? parseInt(newTarget.quarter) : null,
          year: parseInt(newTarget.year),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create target');
      }

      const created = await response.json();
      setLocalTargets(prev => [...prev, created]);
      setNewTarget(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Handle close
  const handleClose = () => {
    onSave(localTargets);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={handleClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl bg-white rounded-xl shadow-xl border border-neutral-200 overflow-hidden max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h3 className="text-lg font-semibold text-brand-navy">Configure Forecast Targets</h3>
            <button onClick={handleClose} className="text-neutral-500 hover:text-neutral-700 p-1">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {/* Existing targets */}
              {localTargets.length === 0 && !newTarget && (
                <div className="text-center py-8 text-neutral-500">
                  No targets configured. Add one to get started.
                </div>
              )}

              {localTargets.map((target) => (
                <div
                  key={target.id}
                  className={classNames(
                    'border rounded-lg p-4',
                    editingId === target.id ? 'border-brand-purple bg-purple-50/50' : 'border-neutral-200'
                  )}
                >
                  {editingId === target.id ? (
                    /* Edit mode */
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-neutral-600 mb-1">Type</label>
                          <div className="text-sm font-medium text-neutral-900">
                            {TARGET_TYPES.find(t => t.value === target.target_type)?.label}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-neutral-600 mb-1">Channel</label>
                          <div className="text-sm text-neutral-700">
                            {CHANNELS.find(c => c.value === (target.channel || ''))?.label}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-neutral-600 mb-1">Target Value</label>
                          <input
                            type="number"
                            value={editForm.target_value}
                            onChange={(e) => setEditForm({ ...editForm, target_value: e.target.value })}
                            className="w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
                            placeholder="Enter value..."
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-neutral-600 mb-1">Year</label>
                          <div className="text-sm text-neutral-700">{target.year}</div>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={handleCancel}
                          className="px-3 py-1.5 text-sm border border-neutral-200 rounded-md hover:bg-neutral-50"
                          disabled={saving}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-brand-purple text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                          disabled={saving}
                        >
                          <CheckIcon className="h-4 w-4" />
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* View mode */
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <div>
                          <div className="text-xs text-neutral-500">Type</div>
                          <div className="text-sm font-medium">
                            {TARGET_TYPES.find(t => t.value === target.target_type)?.label}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Channel</div>
                          <div className="text-sm">
                            {target.channel ? (
                              <span className="capitalize">{target.channel}</span>
                            ) : (
                              <span className="text-neutral-400">All</span>
                            )}
                          </div>
                        </div>
                        {target.quarter && (
                          <div>
                            <div className="text-xs text-neutral-500">Quarter</div>
                            <div className="text-sm">Q{target.quarter}</div>
                          </div>
                        )}
                        <div>
                          <div className="text-xs text-neutral-500">Year</div>
                          <div className="text-sm">{target.year}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Target</div>
                          <div className="text-sm font-semibold text-brand-navy">
                            {target.target_type.includes('revenue')
                              ? `$${Number(target.target_value).toLocaleString()}`
                              : Number(target.target_value).toLocaleString()
                            }
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(target)}
                          className="p-2 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded"
                          title="Edit"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(target.id)}
                          className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* New target form */}
              {newTarget && (
                <div className="border border-brand-purple bg-purple-50/50 rounded-lg p-4 space-y-4">
                  <div className="text-sm font-medium text-brand-purple">New Target</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1">Type *</label>
                      <select
                        value={newTarget.target_type}
                        onChange={(e) => setNewTarget({ ...newTarget, target_type: e.target.value })}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
                      >
                        {TARGET_TYPES.map(type => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1">Channel</label>
                      <select
                        value={newTarget.channel}
                        onChange={(e) => setNewTarget({ ...newTarget, channel: e.target.value })}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
                      >
                        {CHANNELS.map(ch => (
                          <option key={ch.value} value={ch.value}>{ch.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1">Target Value *</label>
                      <input
                        type="number"
                        value={newTarget.target_value}
                        onChange={(e) => setNewTarget({ ...newTarget, target_value: e.target.value })}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
                        placeholder={newTarget.target_type.includes('revenue') ? '1000000' : '500'}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1">Year *</label>
                      <select
                        value={newTarget.year}
                        onChange={(e) => setNewTarget({ ...newTarget, year: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
                      >
                        {[2025, 2026, 2027].map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                    {newTarget.target_type.includes('quarterly') && (
                      <div>
                        <label className="block text-xs font-medium text-neutral-600 mb-1">Quarter</label>
                        <select
                          value={newTarget.quarter}
                          onChange={(e) => setNewTarget({ ...newTarget, quarter: e.target.value })}
                          className="w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
                        >
                          {QUARTERS.map(q => (
                            <option key={q.value} value={q.value}>{q.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setNewTarget(null)}
                      className="px-3 py-1.5 text-sm border border-neutral-200 rounded-md hover:bg-neutral-50"
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveNew}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-brand-purple text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                      disabled={saving}
                    >
                      <CheckIcon className="h-4 w-4" />
                      {saving ? 'Saving...' : 'Add Target'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={handleAddNew}
              disabled={!!newTarget || !!editingId}
              className="flex items-center gap-1 px-3 py-2 text-sm text-brand-purple border border-brand-purple rounded-md hover:bg-purple-50 disabled:opacity-50"
            >
              <PlusIcon className="h-4 w-4" />
              Add Target
            </button>
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm bg-neutral-200 text-neutral-700 rounded-md hover:bg-neutral-300"
            >
              Done
            </button>
          </div>
        </div>
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
