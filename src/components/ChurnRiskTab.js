import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  ExclamationTriangleIcon,
  ArrowPathIcon,
  SparklesIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';

const RISK_COLORS = {
  High: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500', badge: 'bg-red-100' },
  Medium: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500', badge: 'bg-amber-100' },
  Low: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', badge: 'bg-emerald-100' },
};

const SIGNAL_LABELS = {
  lesson_gap: 'Lesson Gap',
  frequency_decline: 'Frequency',
  cancellations: 'Cancellations',
  payment_issues: 'Payments',
  tutor_instability: 'Tutor Changes',
  communication_gap: 'Comms Gap',
};

function SignalBar({ signal }) {
  const width = `${signal.score}%`;
  const color = signal.score >= 70 ? 'bg-red-400' : signal.score >= 40 ? 'bg-amber-400' : 'bg-emerald-400';

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-neutral-500 w-20 flex-shrink-0 truncate">{signal.label}</span>
      <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width }} />
      </div>
      <span className="text-xs text-neutral-600 w-6 text-right tabular-nums">{signal.score}</span>
    </div>
  );
}

function RiskBadge({ tier }) {
  const c = RISK_COLORS[tier] || RISK_COLORS.Low;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${c.badge} ${c.text} border ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {tier}
    </span>
  );
}

export default function ChurnRiskTab() {
  const [view, setView] = useState('clients'); // 'clients' | 'tutors'
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [summary, setSummary] = useState({ total_live: 0, high_risk: 0, medium_risk: 0, low_risk: 0 });
  const [riskFilter, setRiskFilter] = useState('');
  const [tutors, setTutors] = useState([]);
  const [loadingTutors, setLoadingTutors] = useState(false);
  const [explanations, setExplanations] = useState({}); // clientId -> reasoning
  const [loadingExplain, setLoadingExplain] = useState({}); // clientId -> boolean

  useEffect(() => {
    fetchAtRisk();
  }, [riskFilter]);

  useEffect(() => {
    if (view === 'tutors' && tutors.length === 0) {
      fetchTutorBoard();
    }
  }, [view]);

  const fetchAtRisk = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (riskFilter) params.set('riskTier', riskFilter);
      const { data } = await axios.get(`/api/churn/at-risk?${params}`, { withCredentials: true });
      setClients(data.clients || []);
      setSummary(data.summary || {});
    } catch (err) {
      console.error('Failed to fetch churn data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTutorBoard = async () => {
    setLoadingTutors(true);
    try {
      const { data } = await axios.get('/api/churn/tutor-board', { withCredentials: true });
      setTutors(data.tutors || []);
    } catch (err) {
      console.error('Failed to fetch tutor board:', err);
    } finally {
      setLoadingTutors(false);
    }
  };

  const handleExplain = async (clientId) => {
    setLoadingExplain(prev => ({ ...prev, [clientId]: true }));
    try {
      const { data } = await axios.post(`/api/churn/${clientId}/explain`, {}, { withCredentials: true });
      setExplanations(prev => ({ ...prev, [clientId]: data.reasoning }));
    } catch (err) {
      console.error('Failed to explain risk:', err);
      setExplanations(prev => ({ ...prev, [clientId]: 'Failed to generate explanation.' }));
    } finally {
      setLoadingExplain(prev => ({ ...prev, [clientId]: false }));
    }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Total Live" value={summary.total_live} color="text-neutral-700" bg="bg-white" />
        <SummaryCard label="High Risk" value={summary.high_risk} color="text-red-700" bg="bg-red-50" />
        <SummaryCard label="Medium Risk" value={summary.medium_risk} color="text-amber-700" bg="bg-amber-50" />
        <SummaryCard label="Low Risk" value={summary.low_risk} color="text-emerald-700" bg="bg-emerald-50" />
      </div>

      {/* View Toggle + Filter */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-neutral-100 rounded-lg p-0.5">
          <button
            onClick={() => setView('clients')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === 'clients' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <ExclamationTriangleIcon className="h-4 w-4" />
            At-Risk Clients
          </button>
          <button
            onClick={() => setView('tutors')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === 'tutors' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <UserGroupIcon className="h-4 w-4" />
            Tutor Board
          </button>
        </div>

        {view === 'clients' && (
          <div className="flex items-center gap-2">
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="text-sm border border-neutral-200 rounded-md px-2 py-1.5 text-neutral-700"
            >
              <option value="">All Risk Levels</option>
              <option value="High">High Risk</option>
              <option value="Medium">Medium Risk</option>
              <option value="Low">Low Risk</option>
            </select>
            <button
              onClick={fetchAtRisk}
              className="p-1.5 text-neutral-400 hover:text-neutral-600 transition-colors"
              title="Refresh"
            >
              <ArrowPathIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {view === 'clients' ? (
        loading ? (
          <div className="flex justify-center py-12 text-neutral-400">Loading churn data...</div>
        ) : clients.length === 0 ? (
          <div className="flex justify-center py-12 text-neutral-400">No at-risk clients found.</div>
        ) : (
          <div className="space-y-2">
            {clients.map(client => (
              <ClientRiskCard
                key={client.id}
                client={client}
                explanation={explanations[client.id]}
                loadingExplain={loadingExplain[client.id]}
                onExplain={() => handleExplain(client.id)}
              />
            ))}
          </div>
        )
      ) : (
        loadingTutors ? (
          <div className="flex justify-center py-12 text-neutral-400">Loading tutor data...</div>
        ) : (
          <TutorChurnBoard tutors={tutors} />
        )
      )}
    </div>
  );
}

function SummaryCard({ label, value, color, bg }) {
  return (
    <div className={`${bg} rounded-lg border border-neutral-200 p-4`}>
      <div className="text-xs text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold ${color} mt-1 tabular-nums`}>{value}</div>
    </div>
  );
}

function ClientRiskCard({ client, explanation, loadingExplain, onExplain }) {
  const [expanded, setExpanded] = useState(false);
  const signals = client.signals || {};
  const c = RISK_COLORS[client.risk_tier] || RISK_COLORS.Low;

  return (
    <div className={`bg-white rounded-lg border ${c.border} overflow-hidden`}>
      {/* Header row */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-neutral-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 w-10 text-center">
            <div className={`text-lg font-bold ${c.text}`}>{client.risk_score}</div>
            <div className="text-xs text-neutral-400" style={{ fontSize: '9px' }}>/ 100</div>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-neutral-900 truncate">
              {client.first_name} {client.last_name}
            </div>
            <div className="text-xs text-neutral-500 truncate">
              {client.market || 'No market'} {client.assigned_tutor_name ? `\u2022 Tutor: ${client.assigned_tutor_name}` : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Top signal indicator */}
          {(() => {
            const topSignal = Object.values(signals).sort((a, b) => b.score - a.score)[0];
            if (topSignal && topSignal.score >= 40) {
              return <span className="text-xs text-neutral-500 hidden sm:block">{topSignal.label}: {topSignal.score}/100</span>;
            }
            return null;
          })()}
          <RiskBadge tier={client.risk_tier} />
          <svg className={`h-4 w-4 text-neutral-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-neutral-100">
          {/* Signal bars */}
          <div className="space-y-1.5 mb-3">
            {Object.entries(signals)
              .sort(([, a], [, b]) => b.score - a.score)
              .map(([key, signal]) => (
                <SignalBar key={key} signal={signal} />
              ))}
          </div>

          {/* Raw data summary */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center mb-3">
            <MiniStat label="Last Lesson" value={`${client.raw.days_since_last_lesson}d`} />
            <MiniStat label="Lessons 30d" value={client.lessons_last_30d} />
            <MiniStat label="Lessons 90d" value={client.lessons_last_90d} />
            <MiniStat label="Cancels 60d" value={client.raw.cancellations_60d} />
            <MiniStat label="Overdue" value={client.raw.overdue_invoices} />
            <MiniStat label="Tutor Swaps" value={client.raw.tutor_changes_90d} />
          </div>

          {/* Claude explanation */}
          {explanation ? (
            <div className="bg-indigo-50 border border-indigo-100 rounded-md p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <SparklesIcon className="h-3.5 w-3.5 text-indigo-500" />
                <span className="text-xs font-semibold text-indigo-700">AI Analysis</span>
              </div>
              <p className="text-xs text-indigo-900 leading-relaxed">{explanation}</p>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onExplain(); }}
              disabled={loadingExplain}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-md hover:bg-indigo-50 transition-colors disabled:opacity-50"
            >
              <SparklesIcon className="h-3.5 w-3.5" />
              {loadingExplain ? 'Analyzing...' : 'Explain Risk'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div>
      <div className="text-neutral-400 uppercase" style={{ fontSize: '9px' }}>{label}</div>
      <div className="text-sm font-semibold text-neutral-700 tabular-nums">{value}</div>
    </div>
  );
}

function TutorChurnBoard({ tutors }) {
  if (tutors.length === 0) {
    return <div className="flex justify-center py-12 text-neutral-400">No tutor data available.</div>;
  }

  return (
    <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-neutral-50 border-b border-neutral-200">
            <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 uppercase tracking-wider">Tutor</th>
            <th className="text-center px-3 py-2.5 text-xs font-medium text-neutral-500 uppercase tracking-wider">Rating</th>
            <th className="text-center px-3 py-2.5 text-xs font-medium text-neutral-500 uppercase tracking-wider">Live</th>
            <th className="text-center px-3 py-2.5 text-xs font-medium text-neutral-500 uppercase tracking-wider">Dormant</th>
            <th className="text-center px-3 py-2.5 text-xs font-medium text-neutral-500 uppercase tracking-wider">Lost 90d</th>
            <th className="text-center px-3 py-2.5 text-xs font-medium text-neutral-500 uppercase tracking-wider">Churn Rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {tutors.map(tutor => {
            const churnColor = tutor.churn_rate >= 50 ? 'text-red-600 font-bold'
              : tutor.churn_rate >= 25 ? 'text-amber-600 font-semibold'
              : 'text-neutral-600';

            return (
              <tr key={tutor.tutor_id} className="hover:bg-neutral-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {tutor.photo && (
                      <img src={tutor.photo} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                    )}
                    <span className="font-medium text-neutral-900 truncate">{tutor.tutor_name}</span>
                  </div>
                </td>
                <td className="text-center px-3 py-3 text-neutral-600">
                  {tutor.review_rating != null ? `${parseFloat(tutor.review_rating).toFixed(1)}` : '-'}
                </td>
                <td className="text-center px-3 py-3 text-neutral-600 tabular-nums">{tutor.live_clients}</td>
                <td className="text-center px-3 py-3 text-neutral-600 tabular-nums">{tutor.dormant_clients}</td>
                <td className="text-center px-3 py-3 text-neutral-600 tabular-nums">
                  {tutor.clients_lost_90d + tutor.went_dormant_90d}
                </td>
                <td className={`text-center px-3 py-3 tabular-nums ${churnColor}`}>
                  {tutor.churn_rate}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
