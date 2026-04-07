import React, { useState } from 'react';
import { XMarkIcon, PencilIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline';

const CATEGORIES = ['Revenue', 'Sales', 'Operations', 'Quality', 'Platform'];
const FORMATS = [
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'percent', label: 'Percent' },
];
const DIRECTIONS = [
  { value: 'above', label: 'Above' },
  { value: 'below', label: 'Below' },
];
const DATA_SOURCES = [
  { value: 'auto', label: 'Auto' },
  { value: 'manual', label: 'Manual' },
];

const EMPTY_FORM = {
  metric_key: '',
  display_name: '',
  owner: '',
  category: 'Revenue',
  goal_value: '',
  goal_direction: 'above',
  display_format: 'number',
  sort_order: 0,
  data_source: 'auto',
};

const inputClass =
  'w-full px-3 py-2.5 text-sm text-neutral-900 bg-white border border-neutral-300 rounded-lg hover:border-neutral-400 focus:border-[#6A469D] focus:ring-2 focus:ring-[#6A469D]/10 placeholder:text-neutral-400 outline-none transition-colors';
const selectClass =
  'w-full px-3 py-2.5 text-sm text-neutral-900 bg-white border border-neutral-300 rounded-lg hover:border-neutral-400 focus:border-[#6A469D] focus:ring-2 focus:ring-[#6A469D]/10 outline-none transition-colors';
const labelClass = 'block text-xs font-medium text-neutral-700 mb-1.5';

function toKey(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export default function ScorecardConfigModal({ open, onClose, metrics, onSave }) {
  const [form, setForm] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  if (!open) return null;

  function startAdd() {
    setForm({ ...EMPTY_FORM });
    setEditingKey(null);
  }

  function startEdit(metric) {
    setForm({
      metric_key: metric.metric_key,
      display_name: metric.display_name || '',
      owner: metric.owner || '',
      category: metric.category || 'Revenue',
      goal_value: metric.goal_value ?? '',
      goal_direction: metric.goal_direction || 'above',
      display_format: metric.display_format || 'number',
      sort_order: metric.sort_order ?? 0,
      data_source: metric.data_source || 'auto',
    });
    setEditingKey(metric.metric_key);
  }

  function cancelForm() {
    setForm(null);
    setEditingKey(null);
  }

  function updateField(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'display_name' && !editingKey) {
        next.metric_key = toKey(value);
      }
      return next;
    });
  }

  async function handleSave() {
    if (!form.display_name.trim() || !form.metric_key.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/scorecard/metrics', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          goal_value: form.goal_value === '' ? null : Number(form.goal_value),
          sort_order: Number(form.sort_order) || 0,
        }),
      });
      setForm(null);
      setEditingKey(null);
      onSave();
    } catch (err) {
      console.error('Failed to save metric', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(key) {
    setSaving(true);
    try {
      await fetch(`/api/scorecard/metrics/${key}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setConfirmDelete(null);
      onSave();
    } catch (err) {
      console.error('Failed to delete metric', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.15)] max-w-lg w-full mx-4 max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <h2 className="text-lg font-semibold text-neutral-900">
            {form ? (editingKey ? 'Edit Measurable' : 'Add Measurable') : 'Configure Measurables'}
          </h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 p-1 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {form ? (
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Display Name</label>
                <input
                  type="text"
                  className={inputClass}
                  value={form.display_name}
                  onChange={e => updateField('display_name', e.target.value)}
                  placeholder="e.g. Weekly Revenue"
                />
              </div>
              <div>
                <label className={labelClass}>Metric Key</label>
                <input
                  type="text"
                  className={`${inputClass} ${editingKey ? 'bg-neutral-50 text-neutral-400 cursor-not-allowed' : ''}`}
                  value={form.metric_key}
                  onChange={e => !editingKey && updateField('metric_key', e.target.value)}
                  readOnly={!!editingKey}
                  placeholder="auto_generated_from_name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Owner</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={form.owner}
                    onChange={e => updateField('owner', e.target.value)}
                    placeholder="e.g. Admin User"
                  />
                </div>
                <div>
                  <label className={labelClass}>Category</label>
                  <select className={selectClass} value={form.category} onChange={e => updateField('category', e.target.value)}>
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Goal</label>
                  <input
                    type="number"
                    className={inputClass}
                    value={form.goal_value}
                    onChange={e => updateField('goal_value', e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className={labelClass}>Direction</label>
                  <select className={selectClass} value={form.goal_direction} onChange={e => updateField('goal_direction', e.target.value)}>
                    {DIRECTIONS.map(d => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Format</label>
                  <select className={selectClass} value={form.display_format} onChange={e => updateField('display_format', e.target.value)}>
                    {FORMATS.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Sort Order</label>
                  <input
                    type="number"
                    className={inputClass}
                    value={form.sort_order}
                    onChange={e => updateField('sort_order', e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Data Source</label>
                  <select className={selectClass} value={form.data_source} onChange={e => updateField('data_source', e.target.value)}>
                    {DATA_SOURCES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {(metrics || []).length === 0 ? (
                <p className="text-sm text-neutral-500 py-8 text-center">No measurables configured.</p>
              ) : (
                (metrics || []).map(m => (
                  <div
                    key={m.metric_key}
                    className="flex items-center justify-between px-4 py-3 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-neutral-900 truncate">{m.display_name}</div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        {m.owner ? m.owner.split(' ')[0] : 'No owner'}
                        <span className="mx-1.5">&middot;</span>
                        {m.category}
                        {m.goal_value != null && (
                          <>
                            <span className="mx-1.5">&middot;</span>
                            <span className="tabular-nums">Goal: {m.goal_value}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-3 shrink-0">
                      {confirmDelete === m.metric_key ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-neutral-500">Delete?</span>
                          <button
                            onClick={() => handleDelete(m.metric_key)}
                            disabled={saving}
                            className="text-xs font-medium text-[#AE255B] hover:text-[#DA2E72] transition-colors disabled:opacity-50"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-xs font-medium text-neutral-500 hover:text-neutral-700 transition-colors"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(m)}
                            className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
                            aria-label={`Edit ${m.display_name}`}
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(m.metric_key)}
                            className="p-1.5 text-neutral-400 hover:text-[#AE255B] hover:bg-[#FCE8F0] rounded-lg transition-colors"
                            aria-label={`Delete ${m.display_name}`}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
          {form ? (
            <>
              <button
                onClick={cancelForm}
                className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.display_name.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-[#6A469D] rounded-lg hover:bg-[#5B3C87] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : editingKey ? 'Update' : 'Add Measurable'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
              >
                Close
              </button>
              <button
                onClick={startAdd}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#6A469D] rounded-lg hover:bg-[#5B3C87] transition-all duration-200"
              >
                <PlusIcon className="h-4 w-4" />
                Add Measurable
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
