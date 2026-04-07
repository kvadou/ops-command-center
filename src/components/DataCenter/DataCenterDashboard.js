import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { DateTime } from 'luxon';
import {
  CircleStackIcon,
  UsersIcon,
  AcademicCapIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  DocumentTextIcon,
  BanknotesIcon,
  CurrencyDollarIcon,
  StarIcon,
  UserGroupIcon,
  ClipboardDocumentListIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  MagnifyingGlassIcon,
  ShieldExclamationIcon,
  ClockIcon,
  ArchiveBoxIcon,
} from '@heroicons/react/24/outline';
import axios from 'axios';

const ENTITY_ICONS = {
  clients: UsersIcon,
  contractors: AcademicCapIcon,
  services: BriefcaseIcon,
  appointments: CalendarDaysIcon,
  invoices: DocumentTextIcon,
  payment_orders: BanknotesIcon,
  adhoc_charges: CurrencyDollarIcon,
  proforma_invoices: ClipboardDocumentListIcon,
  recipients: UserGroupIcon,
  reviews: StarIcon,
  appointment_recipients: UserGroupIcon,
  appointment_contractors: AcademicCapIcon,
  historical_appointments: ClockIcon,
  e4_data: ArchiveBoxIcon,
  mindbody_data: ArchiveBoxIcon,
};

const STATUS_CONFIG = {
  healthy: {
    color: 'bg-[#34B256]',
    textColor: 'text-[#34B256]',
    bgLight: 'bg-[#34B256]/10',
    label: 'Healthy',
    Icon: CheckCircleIcon,
  },
  stale: {
    color: 'bg-[#FACC29]',
    textColor: 'text-[#F79A30]',
    bgLight: 'bg-[#FACC29]/10',
    label: 'Stale',
    Icon: ExclamationTriangleIcon,
  },
  error: {
    color: 'bg-[#DA2E72]',
    textColor: 'text-[#DA2E72]',
    bgLight: 'bg-[#DA2E72]/10',
    label: 'Needs Attention',
    Icon: XCircleIcon,
  },
};

const QUALITY_CONFIG = {
  good: { color: 'text-[#34B256]', bg: 'bg-[#34B256]/10', label: 'Good' },
  fair: { color: 'text-[#F79A30]', bg: 'bg-[#F79A30]/10', label: 'Fair' },
  poor: { color: 'text-[#DA2E72]', bg: 'bg-[#DA2E72]/10', label: 'Poor' },
};

const SEVERITY_COLORS = {
  error: 'bg-[#DA2E72]/10 text-[#DA2E72]',
  warning: 'bg-[#F79A30]/10 text-[#F79A30]',
  info: 'bg-[#50C8DF]/10 text-[#50C8DF]',
};

function relativeTime(isoDate) {
  if (!isoDate) return 'Never';
  return DateTime.fromISO(isoDate).toRelative() || 'Unknown';
}

// ─── Global Search ─────────────────────────────────────────────────
function GlobalSearch({ onNavigate }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await axios.get(`/api/data-center/search?q=${encodeURIComponent(query)}`);
        setResults(res.data);
        setOpen(true);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
  }, [query]);

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" />
        <input
          type="text"
          placeholder="Search all data (clients, tutors, lessons, invoices...)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          className="w-full pl-10 pr-4 py-3 text-sm bg-white border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6A469D]/30 focus:border-[#6A469D] shadow-sm"
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 border-2 border-[#6A469D] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 w-full bg-white rounded-xl shadow-lg border border-neutral-200 z-50 max-h-80 overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={`${r.entity}-${r.id}-${i}`}
              onClick={() => {
                onNavigate(r.entity, r.id);
                setOpen(false);
                setQuery('');
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 text-left border-b border-neutral-50 last:border-0"
            >
              <span className="text-[10px] font-medium uppercase tracking-wider text-[#6A469D] bg-[#6A469D]/10 px-2 py-0.5 rounded-full whitespace-nowrap">
                {r.entityLabel}
              </span>
              <span className="text-sm text-neutral-800 truncate">{r.displayName}</span>
              <span className="text-xs text-neutral-400 ml-auto whitespace-nowrap">#{r.id}</span>
            </button>
          ))}
        </div>
      )}
      {open && query.length >= 2 && results.length === 0 && !searching && (
        <div className="absolute top-full mt-1 w-full bg-white rounded-xl shadow-lg border border-neutral-200 z-50 p-4 text-sm text-neutral-500 text-center">
          No results found
        </div>
      )}
    </div>
  );
}

// ─── Data Quality Card ─────────────────────────────────────────────
function DataQualityCard({ quality }) {
  if (!quality) return null;
  const qCfg = QUALITY_CONFIG[quality.overallQuality] || QUALITY_CONFIG.fair;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShieldExclamationIcon className="h-5 w-5 text-[#6A469D]" />
          <h2 className="text-sm font-semibold text-neutral-900">Data Quality</h2>
        </div>
        <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${qCfg.bg} ${qCfg.color}`}>
          {qCfg.label} — {quality.totalIssues.toLocaleString()} issues
        </div>
      </div>
      {quality.issues.length === 0 ? (
        <p className="text-sm text-neutral-500">All quality checks passed.</p>
      ) : (
        <div className="space-y-2">
          {quality.issues.map((issue, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${SEVERITY_COLORS[issue.severity]}`}>
                  {issue.severity}
                </span>
                <span className="text-neutral-700">{issue.issue}</span>
              </div>
              <span className="text-neutral-500 font-medium">{issue.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Entity Card with Breakdown ────────────────────────────────────
function EntityCard({ entity, onClick }) {
  const Icon = ENTITY_ICONS[entity.key] || CircleStackIcon;
  const statusCfg = STATUS_CONFIG[entity.status] || STATUS_CONFIG.error;

  return (
    <button
      onClick={() => onClick(entity.key)}
      className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5 hover:shadow-md hover:border-[#6A469D]/20 transition-all duration-200 text-left w-full group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#6A469D]/10">
            <Icon className="h-5 w-5 text-[#6A469D]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 leading-tight">
              {entity.label}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              {entity.count.toLocaleString()} records
            </p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${statusCfg.bgLight}`}>
          <div className={`w-2 h-2 rounded-full ${statusCfg.color}`} />
          <span className={`text-xs font-medium ${statusCfg.textColor}`}>
            {statusCfg.label}
          </span>
        </div>
      </div>

      {/* Status Breakdown */}
      {entity.breakdown && entity.breakdown.length > 0 && (
        <div className="mb-3 space-y-1">
          {entity.breakdown.slice(0, 4).map((b, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-neutral-600 capitalize truncate">{b.status || 'Unknown'}</span>
              <span className="text-neutral-500 font-medium ml-2">{b.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>Updated {relativeTime(entity.lastSync || entity.lastUpdated)}</span>
        <span className="text-[#6A469D] opacity-0 group-hover:opacity-100 transition-opacity font-medium">
          View Data &rarr;
        </span>
      </div>
    </button>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────
export default function DataCenterDashboard() {
  const navigate = useNavigate();
  const [health, setHealth] = useState(null);
  const [quality, setQuality] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [market, setMarket] = useState('production');
  const [markets, setMarkets] = useState([]);

  useEffect(() => {
    axios.get('/api/data-center/markets')
      .then(res => setMarkets(res.data))
      .catch(() => {});
  }, []);

  const fetchAll = () => {
    setLoading(true);
    const mq = market ? `?market=${market}` : '';
    Promise.all([
      axios.get(`/api/data-center/health${mq}`),
      axios.get(`/api/data-center/quality${mq}`),
    ])
      .then(([healthRes, qualityRes]) => {
        setHealth(healthRes.data);
        setQuality(qualityRes.data);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, [market]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto w-full">
        <div className="animate-pulse space-y-6">
          <div className="h-24 bg-neutral-100 rounded-xl" />
          <div className="h-12 bg-neutral-100 rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-36 bg-neutral-100 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto w-full">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-8 text-center">
          <XCircleIcon className="h-10 w-10 text-[#DA2E72] mx-auto mb-3" />
          <p className="text-neutral-700">Failed to load data health: {error}</p>
        </div>
      </div>
    );
  }

  const systemStatusCfg = STATUS_CONFIG[health.systemStatus] || STATUS_CONFIG.error;
  const SystemIcon = systemStatusCfg.Icon;

  const tcEntities = health.entities.filter(e => e.category === 'tc');
  const historicalEntities = health.entities.filter(e => e.category === 'historical');

  const handleSearchNavigate = (entityKey) => {
    navigate(`/analytics/data-center/${entityKey}`);
  };

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      {/* System Health Summary */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${systemStatusCfg.bgLight}`}>
              <CircleStackIcon className={`h-7 w-7 ${systemStatusCfg.textColor}`} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-neutral-900">Data Center</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <SystemIcon className={`h-4 w-4 ${systemStatusCfg.textColor}`} />
                <span className={`text-sm font-medium ${systemStatusCfg.textColor}`}>
                  System {systemStatusCfg.label}
                </span>
                <span className="text-neutral-300">|</span>
                <span className="text-sm text-neutral-500">
                  {health.totalRecords.toLocaleString()} total records across {health.entities.length} entities
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* Market Toggle */}
            {markets.length > 1 && (
              <div className="flex items-center bg-neutral-100 rounded-lg p-0.5">
                {markets.map(m => (
                  <button
                    key={m.key}
                    onClick={() => setMarket(m.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      market === m.key
                        ? 'bg-white text-[#6A469D] shadow-sm'
                        : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={fetchAll}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#6A469D] bg-[#6A469D]/10 rounded-lg hover:bg-[#6A469D]/20 transition-colors"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Global Search */}
      <GlobalSearch onNavigate={handleSearchNavigate} />

      {/* Data Quality + Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DataQualityCard quality={quality} />
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Quick Stats</h2>
          <div className="grid grid-cols-2 gap-3">
            {tcEntities.filter(e => e.breakdown && e.breakdown.length > 0).slice(0, 4).map(entity => {
              const topStatus = entity.breakdown[0];
              return (
                <div key={entity.key} className="text-center p-2 rounded-lg bg-neutral-50">
                  <p className="text-lg font-semibold text-neutral-900">{entity.count.toLocaleString()}</p>
                  <p className="text-xs text-neutral-500">{entity.label}</p>
                  {topStatus && (
                    <p className="text-[10px] text-neutral-400 mt-0.5 capitalize">
                      {topStatus.count.toLocaleString()} {topStatus.status}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* TC Entity Cards */}
      <div>
        <h2 className="text-sm font-semibold text-neutral-900 mb-3 flex items-center gap-2">
          <CircleStackIcon className="h-4 w-4 text-[#6A469D]" />
          TutorCruncher Data
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tcEntities.map(entity => (
            <EntityCard
              key={entity.key}
              entity={entity}
              onClick={(key) => navigate(`/analytics/data-center/${key}`)}
            />
          ))}
        </div>
      </div>

      {/* Historical Entity Cards */}
      {historicalEntities.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 mb-3 flex items-center gap-2">
            <ArchiveBoxIcon className="h-4 w-4 text-[#6A469D]" />
            Historical Data (MindBody &amp; E4)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {historicalEntities.map(entity => (
              <EntityCard
                key={entity.key}
                entity={entity}
                onClick={(key) => navigate(`/analytics/data-center/${key}`)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
