import React, { useState, useEffect } from 'react';
import {
  BeakerIcon,
  PlusIcon,
  PlayIcon,
  PauseIcon,
  TrophyIcon,
  ArrowDownTrayIcon,
  ChevronRightIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

/**
 * MarketingABTests - A/B Test tracking and management UI
 */
export default function MarketingABTests() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTest, setSelectedTest] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filter, setFilter] = useState('active');

  useEffect(() => {
    loadTests();
  }, [filter]);

  const loadTests = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/marketing-command-center/ab-tests?status=${filter}`);
      if (res.ok) {
        const data = await res.json();
        setTests(data);
      }
    } catch (err) {
      console.error('Error loading A/B tests:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTest = async (testData) => {
    try {
      const res = await fetch('/api/marketing-command-center/ab-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData),
      });
      if (res.ok) {
        loadTests();
        setShowCreateModal(false);
      }
    } catch (err) {
      console.error('Error creating test:', err);
    }
  };

  const handleStatusChange = async (testId, newStatus) => {
    try {
      await fetch(`/api/marketing-command-center/ab-tests/${testId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      loadTests();
    } catch (err) {
      console.error('Error updating test status:', err);
    }
  };

  const handleExport = async (testId) => {
    try {
      const res = await fetch(`/api/marketing-command-center/export/ab-test/${testId}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ab-test-${testId}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BeakerIcon className="h-6 w-6 text-brand-navy" />
          <h2 className="text-lg font-semibold text-neutral-900">A/B Tests</h2>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5"
          >
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="draft">Draft</option>
            <option value="">All</option>
          </select>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1 text-sm text-white bg-brand-navy
                     hover:bg-brand-navy/90 rounded-lg px-3 py-1.5"
          >
            <PlusIcon className="h-4 w-4" />
            New Test
          </button>
        </div>
      </div>

      {/* Tests List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-neutral-200 p-6 animate-pulse">
              <div className="h-5 bg-neutral-200 rounded w-1/3 mb-3" />
              <div className="h-4 bg-neutral-100 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : tests.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
          <BeakerIcon className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 mb-2">No A/B Tests</h3>
          <p className="text-sm text-neutral-500 mb-4">
            Create your first A/B test to start optimizing your campaigns.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 text-sm text-white bg-brand-navy
                     hover:bg-brand-navy/90 rounded-lg px-4 py-2"
          >
            <PlusIcon className="h-4 w-4" />
            Create Test
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {tests.map(test => (
            <TestCard
              key={test.id}
              test={test}
              onSelect={() => setSelectedTest(test)}
              onStatusChange={handleStatusChange}
              onExport={handleExport}
            />
          ))}
        </div>
      )}

      {/* Test Detail Modal */}
      {selectedTest && (
        <TestDetailModal
          testId={selectedTest.id}
          onClose={() => setSelectedTest(null)}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* Create Test Modal */}
      {showCreateModal && (
        <CreateTestModal
          onSubmit={handleCreateTest}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}

function TestCard({ test, onSelect, onStatusChange, onExport }) {
  const statusColors = {
    active: 'bg-green-100 text-green-700',
    paused: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-blue-100 text-blue-700',
    draft: 'bg-neutral-100 text-neutral-700',
  };

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-base font-semibold text-neutral-900">{test.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[test.status]}`}>
              {test.status}
            </span>
            {test.winner_variant_id && (
              <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                <TrophyIcon className="h-3 w-3" />
                Winner declared
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-500 mb-3">
            {test.platform} - {test.test_type} | {test.variant_count || 0} variants
          </p>
          {test.hypothesis && (
            <p className="text-sm text-neutral-600 line-clamp-2">{test.hypothesis}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {test.status === 'active' && (
            <button
              onClick={() => onStatusChange(test.id, 'paused')}
              className="p-2 text-neutral-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
              title="Pause test"
            >
              <PauseIcon className="h-5 w-5" />
            </button>
          )}
          {test.status === 'paused' && (
            <button
              onClick={() => onStatusChange(test.id, 'active')}
              className="p-2 text-neutral-500 hover:text-green-600 hover:bg-green-50 rounded-lg"
              title="Resume test"
            >
              <PlayIcon className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={() => onExport(test.id)}
            className="p-2 text-neutral-500 hover:text-brand-navy hover:bg-brand-navy/10 rounded-lg"
            title="Export data"
          >
            <ArrowDownTrayIcon className="h-5 w-5" />
          </button>
          <button
            onClick={onSelect}
            className="p-2 text-neutral-500 hover:text-brand-navy hover:bg-brand-navy/10 rounded-lg"
            title="View details"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function TestDetailModal({ testId, onClose, onStatusChange }) {
  const [test, setTest] = useState(null);
  const [timeSeries, setTimeSeries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTestDetails();
  }, [testId]);

  const loadTestDetails = async () => {
    setLoading(true);
    try {
      const [testRes, tsRes] = await Promise.all([
        fetch(`/api/marketing-command-center/ab-tests/${testId}`),
        fetch(`/api/marketing-command-center/ab-tests/${testId}/time-series`),
      ]);

      if (testRes.ok) setTest(await testRes.json());
      if (tsRes.ok) setTimeSeries(await tsRes.json());
    } catch (err) {
      console.error('Error loading test details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeclareWinner = async (variantId) => {
    try {
      await fetch(`/api/marketing-command-center/ab-tests/${testId}/winner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winnerVariantId: variantId, conclusion: 'Manual selection' }),
      });
      loadTestDetails();
    } catch (err) {
      console.error('Error declaring winner:', err);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-navy" />
        </div>
      </div>
    );
  }

  if (!test) return null;

  // Prepare chart data by date and variant
  const chartData = [];
  const dates = [...new Set(timeSeries.map(t => t.date))].sort();
  dates.forEach(date => {
    const row = { date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
    timeSeries.filter(t => t.date === date).forEach(t => {
      row[`${t.variant_name} CR`] = t.conversions > 0 && t.impressions > 0
        ? ((t.conversions / t.impressions) * 100).toFixed(2)
        : 0;
    });
    chartData.push(row);
  });

  const variantNames = [...new Set(timeSeries.map(t => t.variant_name))];
  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">{test.name}</h2>
            <p className="text-sm text-neutral-500">{test.platform} - {test.test_type}</p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Hypothesis */}
          {test.hypothesis && (
            <div className="bg-neutral-50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-neutral-700 mb-1">Hypothesis</h4>
              <p className="text-sm text-neutral-600">{test.hypothesis}</p>
            </div>
          )}

          {/* Variants */}
          <div>
            <h4 className="text-sm font-medium text-neutral-700 mb-3">Variants</h4>
            <div className="space-y-3">
              {test.variants?.map((variant, idx) => (
                <div
                  key={variant.id}
                  className={`border rounded-lg p-4 ${
                    test.winner_variant_id === variant.id
                      ? 'border-amber-300 bg-amber-50'
                      : 'border-neutral-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                      />
                      <span className="font-medium text-neutral-900">{variant.name}</span>
                      {variant.is_control && (
                        <span className="text-xs text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded">
                          Control
                        </span>
                      )}
                      {test.winner_variant_id === variant.id && (
                        <TrophyIcon className="h-4 w-4 text-amber-500" />
                      )}
                    </div>
                    {test.status === 'active' && !test.winner_variant_id && (
                      <button
                        onClick={() => handleDeclareWinner(variant.id)}
                        className="text-xs text-brand-navy hover:underline"
                      >
                        Declare Winner
                      </button>
                    )}
                  </div>
                  {variant.metrics && (
                    <div className="grid grid-cols-4 gap-4 mt-3 text-sm">
                      <div>
                        <span className="text-neutral-500">Impressions</span>
                        <p className="font-medium">{parseInt(variant.metrics.total_impressions || 0).toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-neutral-500">Conversions</span>
                        <p className="font-medium">{parseInt(variant.metrics.total_conversions || 0).toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-neutral-500">Conv. Rate</span>
                        <p className="font-medium">
                          {variant.metrics.total_impressions > 0
                            ? ((variant.metrics.total_conversions / variant.metrics.total_impressions) * 100).toFixed(2)
                            : 0}%
                        </p>
                      </div>
                      <div>
                        <span className="text-neutral-500">Confidence</span>
                        <p className="font-medium">
                          {variant.metrics.latest_significance
                            ? `${variant.metrics.latest_significance}%`
                            : 'N/A'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-neutral-700 mb-3">Conversion Rate Over Time</h4>
              <div className="h-64 bg-white border rounded-lg p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                    <Tooltip />
                    <Legend />
                    {variantNames.map((name, idx) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={`${name} CR`}
                        name={name}
                        stroke={COLORS[idx % COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateTestModal({ onSubmit, onClose }) {
  const [form, setForm] = useState({
    name: '',
    platform: 'meta',
    testType: 'audience',
    hypothesis: '',
    variants: [
      { name: 'Control', isControl: true },
      { name: 'Variant A', isControl: false },
    ],
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (form.name.trim() && form.variants.length >= 2) {
      onSubmit({
        ...form,
        startDate: new Date().toISOString().split('T')[0],
      });
    }
  };

  const addVariant = () => {
    const letter = String.fromCharCode(65 + form.variants.length - 1);
    setForm({
      ...form,
      variants: [...form.variants, { name: `Variant ${letter}`, isControl: false }],
    });
  };

  const removeVariant = (idx) => {
    if (form.variants.length <= 2) return;
    setForm({
      ...form,
      variants: form.variants.filter((_, i) => i !== idx),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold text-neutral-900">Create A/B Test</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Test Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Homepage CTA Test"
              className="w-full border border-neutral-200 rounded-lg px-3 py-2"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Platform</label>
              <select
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2"
              >
                <option value="meta">Meta</option>
                <option value="google">Google</option>
                <option value="tiktok">TikTok</option>
                <option value="linkedin">LinkedIn</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Test Type</label>
              <select
                value={form.testType}
                onChange={(e) => setForm({ ...form, testType: e.target.value })}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2"
              >
                <option value="audience">Audience</option>
                <option value="creative">Creative</option>
                <option value="copy">Copy</option>
                <option value="landing_page">Landing Page</option>
                <option value="bidding">Bidding</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Hypothesis</label>
            <textarea
              value={form.hypothesis}
              onChange={(e) => setForm({ ...form, hypothesis: e.target.value })}
              placeholder="What do you expect to learn from this test?"
              rows={2}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-neutral-700">Variants</label>
              <button
                type="button"
                onClick={addVariant}
                className="text-xs text-brand-navy hover:underline"
              >
                + Add Variant
              </button>
            </div>
            <div className="space-y-2">
              {form.variants.map((v, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={v.name}
                    onChange={(e) => {
                      const variants = [...form.variants];
                      variants[idx].name = e.target.value;
                      setForm({ ...form, variants });
                    }}
                    className="flex-1 border border-neutral-200 rounded-lg px-3 py-2 text-sm"
                  />
                  {v.isControl && (
                    <span className="text-xs text-neutral-500 bg-neutral-100 px-2 py-1 rounded">
                      Control
                    </span>
                  )}
                  {!v.isControl && form.variants.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeVariant(idx)}
                      className="text-neutral-400 hover:text-red-500"
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm text-white bg-brand-navy hover:bg-brand-navy/90 rounded-lg"
            >
              Create Test
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
