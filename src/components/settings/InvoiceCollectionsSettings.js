import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useToast } from '../../hooks/useToast';
import {
  EnvelopeIcon,
  PlusIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

const MERGE_TAGS = ['{{display_id}}', '{{school_name}}', '{{amount}}', '{{days_overdue}}', '{{date_sent}}'];

function Toggle({ checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-3 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
          checked ? 'bg-indigo-600' : 'bg-neutral-300'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
      <span className="text-sm font-medium text-neutral-700">{label}</span>
    </label>
  );
}

function EmailChips({ emails, onChange, label }) {
  const [input, setInput] = useState('');

  const addEmail = () => {
    const email = input.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if (emails.includes(email)) return;
    onChange([...emails, email]);
    setInput('');
  };

  const removeEmail = (idx) => {
    onChange(emails.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">{label}</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {emails.map((email, idx) => (
          <span
            key={email}
            className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-sm text-indigo-700"
          >
            {email}
            <button
              type="button"
              onClick={() => removeEmail(idx)}
              className="text-indigo-400 hover:text-indigo-700 transition-colors"
            >
              <XMarkIcon className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        {emails.length === 0 && (
          <span className="text-xs text-neutral-400 italic">No recipients added</span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="email"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
          placeholder="Add email..."
          className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
        />
        <button
          type="button"
          onClick={addEmail}
          className="inline-flex items-center gap-1 rounded-md bg-neutral-100 border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-200 transition-colors"
        >
          <PlusIcon className="h-4 w-4" />
          Add
        </button>
      </div>
    </div>
  );
}

export default function InvoiceCollectionsSettings() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(null);
  const [config, setConfig] = useState(null);
  const [history, setHistory] = useState([]);

  const fetchData = useCallback(async () => {
    try {
      const configRes = await axios.get('/api/app-settings/invoice_escalation_config');
      setConfig(configRes.data.value || configRes.data);
    } catch (err) {
      toast.error('Failed to load escalation settings');
    }
    try {
      const historyRes = await axios.get('/api/app-settings/invoice-escalation/history');
      setHistory(historyRes.data || []);
    } catch (err) {
      // History may be empty or table may not exist yet — non-fatal
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateConfig = (patch) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  };

  const updateThreshold = (idx, patch) => {
    setConfig((prev) => {
      const thresholds = prev.thresholds.map((t, i) => (i === idx ? { ...t, ...patch } : t));
      return { ...prev, thresholds };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put('/api/app-settings/invoice_escalation_config', { value: config });
      toast.success('Settings saved');
    } catch (err) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async (idx) => {
    setSendingTest(idx);
    try {
      await axios.post('/api/app-settings/invoice-escalation/test', { thresholdIndex: idx });
      const recipient = config.recipients?.[0] || 'configured recipients';
      toast.success(`Test email sent to ${recipient}`);
    } catch (err) {
      toast.error('Failed to send test email');
    } finally {
      setSendingTest(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div className="flex items-center gap-3">
          <ArrowPathIcon className="h-5 w-5 text-neutral-400 animate-spin" />
          <span className="text-sm text-neutral-500">Loading escalation settings...</span>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <p className="text-sm text-neutral-500">No escalation config found. Save to create one.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200">
      {/* Header */}
      <div className="px-6 py-5 border-b border-neutral-200">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-indigo-50">
            <EnvelopeIcon className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-neutral-900 leading-tight">Invoice Collections</h3>
            <p className="text-sm text-neutral-500">Automated escalation emails for overdue school invoices</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* Escalation Emails Section */}
        <section className="space-y-5">
          <h4 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide border-b border-neutral-100 pb-2">
            Escalation Emails
          </h4>

          <Toggle
            checked={config.enabled}
            onChange={(val) => updateConfig({ enabled: val })}
            label="Enable automated escalations"
          />

          <EmailChips
            label="Recipients"
            emails={config.recipients || []}
            onChange={(recipients) => updateConfig({ recipients })}
          />

          {/* Thresholds */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">Thresholds</label>
            <div className="space-y-3">
              {(config.thresholds || []).map((threshold, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={threshold.enabled}
                        onChange={(e) => updateThreshold(idx, { enabled: e.target.checked })}
                        className="h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm font-semibold text-neutral-800">{threshold.label}</span>
                      <span className="text-xs text-neutral-400">({threshold.days} days)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleSendTest(idx)}
                      disabled={sendingTest !== null}
                      className="inline-flex items-center gap-1.5 rounded-md bg-white border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {sendingTest === idx ? (
                        <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <PaperAirplaneIcon className="h-3.5 w-3.5" />
                      )}
                      Send Test
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Subject</label>
                    <input
                      type="text"
                      value={threshold.subject || ''}
                      onChange={(e) => updateThreshold(idx, { subject: e.target.value })}
                      className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Body</label>
                    <textarea
                      value={threshold.body || ''}
                      onChange={(e) => updateThreshold(idx, { body: e.target.value })}
                      rows={4}
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-mono leading-relaxed focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-y"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Merge Tags */}
          <div className="rounded-md bg-neutral-50 border border-neutral-200 px-4 py-3">
            <p className="text-xs text-neutral-500 mb-1.5">Available merge tags:</p>
            <div className="flex flex-wrap gap-1.5">
              {MERGE_TAGS.map((tag) => (
                <code
                  key={tag}
                  className="rounded bg-white border border-neutral-200 px-2 py-0.5 text-xs font-mono text-indigo-600"
                >
                  {tag}
                </code>
              ))}
            </div>
          </div>
        </section>

        {/* Daily Digest Section */}
        <section className="space-y-5">
          <h4 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide border-b border-neutral-100 pb-2">
            Daily Follow-Up Digest
          </h4>

          <Toggle
            checked={config.digestEnabled || false}
            onChange={(val) => updateConfig({ digestEnabled: val })}
            label="Enable daily digest"
          />

          <EmailChips
            label="Digest Recipients"
            emails={config.digestRecipients || []}
            onChange={(digestRecipients) => updateConfig({ digestRecipients })}
          />
        </section>

        {/* Recent Escalations */}
        <section className="space-y-3">
          <h4 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide border-b border-neutral-100 pb-2">
            Recent Escalations
          </h4>

          {history.length === 0 ? (
            <p className="text-sm text-neutral-400 italic py-4 text-center">No escalations sent yet</p>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200">
                    <th className="px-6 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Date</th>
                    <th className="px-6 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">School</th>
                    <th className="px-6 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Invoice</th>
                    <th className="px-6 py-2 text-right text-xs font-medium text-neutral-500 uppercase tracking-wide">Amount</th>
                    <th className="px-6 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Threshold</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {history.slice(0, 20).map((row, idx) => (
                    <tr key={idx} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-6 py-2.5 text-neutral-700 whitespace-nowrap">
                        {row.sent_at ? new Date(row.sent_at).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-6 py-2.5 text-neutral-900 font-medium">{row.school_name || '-'}</td>
                      <td className="px-6 py-2.5 text-neutral-700 font-mono">{row.display_id || row.invoice_id || '-'}</td>
                      <td className="px-6 py-2.5 text-neutral-700 text-right whitespace-nowrap">
                        {row.amount != null ? `$${Number(row.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                      </td>
                      <td className="px-6 py-2.5">
                        <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                          {row.threshold_label || `${row.days_overdue || '?'}d`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {saving && <ArrowPathIcon className="h-4 w-4 animate-spin" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
