import React, { useState, useEffect } from 'react';
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ChartBarIcon,
  AdjustmentsHorizontalIcon,
  PlayIcon,
  PauseIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline';

/**
 * OptimizationTracker - Track marketing optimization actions and their results
 *
 * Shows:
 * - Recently executed actions with before/after states
 * - Performance trends since each change
 * - Overall optimization impact summary
 */
export default function OptimizationTracker() {
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState('7d');

  useEffect(() => {
    fetchExecutions();
  }, [timeRange]);

  const fetchExecutions = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/marketing-command-center/recent-executions?limit=50');
      if (!response.ok) throw new Error('Failed to fetch executions');
      const data = await response.json();
      setExecutions(data.executions || data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (actionType) => {
    switch (actionType) {
      case 'PAUSE_CAMPAIGN':
        return <PauseIcon className="h-5 w-5 text-yellow-500" />;
      case 'RESUME_CAMPAIGN':
        return <PlayIcon className="h-5 w-5 text-green-500" />;
      case 'ADJUST_BUDGET':
        return <CurrencyDollarIcon className="h-5 w-5 text-blue-500" />;
      case 'MODIFY_TARGETING':
        return <AdjustmentsHorizontalIcon className="h-5 w-5 text-purple-500" />;
      default:
        return <ChartBarIcon className="h-5 w-5 text-neutral-500" />;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'executed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircleIcon className="h-3 w-3" />
            Executed
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircleIcon className="h-3 w-3" />
            Failed
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <ClockIcon className="h-3 w-3" />
            Pending
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800">
            {status}
          </span>
        );
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const calculateImpact = (beforeState, afterState) => {
    if (!beforeState || !afterState) return null;

    const before = beforeState.metrics || beforeState;
    const after = afterState.metrics || afterState;

    if (before.spend && after.spend) {
      const spendChange = ((after.spend - before.spend) / before.spend) * 100;
      return {
        metric: 'Spend',
        before: `$${before.spend.toFixed(2)}`,
        after: `$${after.spend.toFixed(2)}`,
        change: spendChange,
      };
    }

    return null;
  };

  // Summary stats
  const executedCount = executions.filter(e => e.status === 'executed').length;
  const failedCount = executions.filter(e => e.status === 'failed').length;
  const pendingCount = executions.filter(e => e.status === 'pending' || e.status === 'approved').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        Error loading optimization data: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">Optimization Tracker</h2>
          <p className="text-sm text-neutral-500 mt-1">
            Track the impact of your marketing optimizations over time
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-brand-purple focus:border-brand-purple"
          >
            <option value="7d">Last 7 days</option>
            <option value="14d">Last 14 days</option>
            <option value="30d">Last 30 days</option>
          </select>
          <button
            onClick={fetchExecutions}
            className="px-3 py-2 bg-brand-purple text-white rounded-lg text-sm hover:bg-brand-navy transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ChartBarIcon className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-neutral-900">{executions.length}</p>
              <p className="text-sm text-neutral-500">Total Actions</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircleIcon className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-neutral-900">{executedCount}</p>
              <p className="text-sm text-neutral-500">Executed</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <ClockIcon className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-neutral-900">{pendingCount}</p>
              <p className="text-sm text-neutral-500">Pending</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <XCircleIcon className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-neutral-900">{failedCount}</p>
              <p className="text-sm text-neutral-500">Failed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions List */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200">
        <div className="px-4 py-3 border-b border-neutral-200">
          <h3 className="text-lg font-medium text-neutral-900">Recent Actions</h3>
        </div>

        {executions.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            <ChartBarIcon className="h-12 w-12 mx-auto mb-4 text-neutral-300" />
            <p className="text-lg font-medium">No optimization actions yet</p>
            <p className="text-sm mt-1">
              Approve actions from the AI Advisor to start tracking their impact
            </p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {executions.map((execution) => {
              const impact = calculateImpact(execution.before_state, execution.after_state);

              return (
                <div key={execution.id} className="p-4 hover:bg-neutral-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {getActionIcon(execution.action_type)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-neutral-900">
                            {execution.action_type?.replace(/_/g, ' ')}
                          </span>
                          {getStatusBadge(execution.status)}
                          <span className="text-xs text-neutral-400 uppercase">
                            {execution.platform}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">
                          {execution.target_name || execution.target_id}
                        </p>
                        {execution.ai_reasoning && (
                          <p className="text-xs text-neutral-500 mt-1 line-clamp-2">
                            {execution.ai_reasoning}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-sm text-neutral-500">
                        {formatDate(execution.executed_at || execution.approved_at)}
                      </p>

                      {impact && (
                        <div className="mt-2 flex items-center gap-1 justify-end">
                          {impact.change > 0 ? (
                            <ArrowTrendingUpIcon className="h-4 w-4 text-green-500" />
                          ) : (
                            <ArrowTrendingDownIcon className="h-4 w-4 text-red-500" />
                          )}
                          <span className={`text-sm font-medium ${impact.change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {impact.change > 0 ? '+' : ''}{impact.change.toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Before/After State */}
                  {(execution.before_state || execution.after_state) && (
                    <div className="mt-3 ml-8 grid grid-cols-2 gap-4 p-3 bg-neutral-50 rounded-lg text-xs">
                      <div>
                        <p className="font-medium text-neutral-500 uppercase tracking-wide mb-1">Before</p>
                        <pre className="text-neutral-700 whitespace-pre-wrap">
                          {JSON.stringify(execution.before_state, null, 2)?.substring(0, 200)}
                        </pre>
                      </div>
                      <div>
                        <p className="font-medium text-neutral-500 uppercase tracking-wide mb-1">After</p>
                        <pre className="text-neutral-700 whitespace-pre-wrap">
                          {JSON.stringify(execution.after_state, null, 2)?.substring(0, 200)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Error Message */}
                  {execution.status === 'failed' && execution.execution_result?.error && (
                    <div className="mt-3 ml-8 p-3 bg-red-50 rounded-lg">
                      <p className="text-sm text-red-700">
                        <strong>Error:</strong> {execution.execution_result.error}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Help Text */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">How to use the Optimization Tracker</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• <strong>Executed</strong> - Action was successfully applied to your ad account</li>
          <li>• <strong>Failed</strong> - Action encountered an error (check error message for details)</li>
          <li>• <strong>Pending</strong> - Action is approved but not yet executed</li>
          <li>• Check back after 1-2 weeks to see performance changes from your optimizations</li>
        </ul>
      </div>
    </div>
  );
}
