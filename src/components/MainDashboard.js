import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useCompanyName } from "../contexts/CompanyNameContext";
import { DateTime } from "luxon";
import axios from "axios";
import {
  CalendarDaysIcon,
  InboxIcon,
  FunnelIcon,
  UserGroupIcon,
  BriefcaseIcon,
  ChartBarIcon,
  SparklesIcon,
  BuildingOfficeIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ArrowTrendingUpIcon,
  UserPlusIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  BanknotesIcon,
  BoltIcon,
} from "@heroicons/react/24/outline";

// ─── Utilities ──────────────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatCurrency(val) {
  const n = parseFloat(val) || 0;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ─── Stat Card ───────────────────────────────────────────────
function StatCard({ label, value, subtitle, icon: Icon, to, color = "#6A469D", loading }) {
  const inner = (
    <div className="bg-white rounded-xl border border-neutral-200 p-5 hover:shadow-md hover:border-[#6A469D]/20 transition-all group h-full">
      <div className="flex items-start justify-between mb-3">
        <div className="p-2.5 rounded-lg" style={{ backgroundColor: `${color}15` }}>
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
        {to && <ArrowRightIcon className="h-4 w-4 text-neutral-300 group-hover:text-[#6A469D] transition-colors" />}
      </div>
      {loading ? (
        <div className="animate-pulse">
          <div className="h-8 bg-neutral-200 rounded w-16 mb-1" />
          <div className="h-4 bg-neutral-100 rounded w-24" />
        </div>
      ) : (
        <>
          <p className="text-3xl font-bold text-neutral-900 mb-0.5">{value}</p>
          <p className="text-sm text-neutral-500">{subtitle || label}</p>
        </>
      )}
    </div>
  );
  return to ? <Link to={to} className="block h-full">{inner}</Link> : inner;
}

// ─── Section Header ──────────────────────────────────────────
function SectionHeader({ title, action, actionTo }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">{title}</h3>
      {action && actionTo && (
        <Link to={actionTo} className="text-xs font-medium text-[#6A469D] hover:text-[#2D2F8E] transition-colors">{action}</Link>
      )}
    </div>
  );
}

// ─── Submission Row ──────────────────────────────────────────
function SubmissionRow({ sub }) {
  const name = [sub.parent_first_name, sub.parent_last_name].filter(Boolean).join(" ") || "Unknown";
  const bookingType = sub.booking_type_name || sub.label_name || "Booking";
  return (
    <Link to="/pipeline" className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-neutral-50 transition-colors">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sub.status === 'processed' ? 'bg-[#34B256]' : sub.status === 'pending' ? 'bg-[#F79A30]' : 'bg-neutral-300'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-800 truncate">{name}</p>
        <p className="text-xs text-neutral-500 truncate">{bookingType}</p>
      </div>
      <span className="text-xs text-neutral-400 flex-shrink-0">{timeAgo(sub.created_at || sub.submission_date)}</span>
    </Link>
  );
}

// ─── Pipeline Stage Row ──────────────────────────────────────
function PipelineRow({ stage, count }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-neutral-700">{stage}</span>
      <span className="text-sm font-semibold text-neutral-900 bg-neutral-100 px-2.5 py-0.5 rounded-full">{count}</span>
    </div>
  );
}

// ─── GGHS Counter ────────────────────────────────────────────
function GghsCounter({ count, loading }) {
  const formatted = count ? count.toLocaleString() : "—";
  const target = 1000000;
  const pct = count ? Math.min((count / target) * 100, 100) : 0;
  return (
    <div className="bg-gradient-to-br from-[#2D2F8E] to-[#6A469D] rounded-xl p-5 text-white h-full flex flex-col justify-between">
      <div className="flex items-center gap-2 mb-3">
        <SparklesIcon className="h-5 w-5 text-amber-300" />
        <span className="text-sm font-semibold">Good Game Handshakes</span>
      </div>
      {loading ? (
        <div className="animate-pulse"><div className="h-8 bg-white/20 rounded w-32" /></div>
      ) : (
        <>
          <p className="text-3xl font-bold tracking-tight mb-2">{formatted}</p>
          <div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full transition-all duration-1000" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-blue-200 mt-1">{pct.toFixed(1)}% of 1M goal</p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Activity Feed Event Icons ───────────────────────────────
const EVENT_CONFIG = {
  lesson_completed: { icon: CheckCircleIcon, color: '#34B256', label: 'Lesson Completed' },
  booking_submitted: { icon: InboxIcon, color: '#F79A30', label: 'Booking' },
  invoice_paid: { icon: BanknotesIcon, color: '#34B256', label: 'Invoice Paid' },
  client_created: { icon: UserPlusIcon, color: '#6A469D', label: 'New Client' },
  payment_sent: { icon: CurrencyDollarIcon, color: '#50C8DF', label: 'Payment Sent' },
};

// ─── Activity Feed Item ─────────────────────────────────────
function ActivityItem({ event }) {
  const cfg = EVENT_CONFIG[event.event_type] || EVENT_CONFIG.lesson_completed;
  const Icon = cfg.icon;
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="p-1.5 rounded-lg flex-shrink-0 mt-0.5" style={{ backgroundColor: `${cfg.color}15` }}>
        <Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-neutral-800 truncate">{event.title?.trim()}</p>
        <p className="text-xs text-neutral-500 truncate">{event.description}</p>
      </div>
      <span className="text-xs text-neutral-400 flex-shrink-0 whitespace-nowrap">{timeAgo(event.event_time)}</span>
    </div>
  );
}

// ─── Needs Attention Item ───────────────────────────────────
const SEVERITY_STYLES = {
  error: { bg: 'bg-[#DA2E72]/10', text: 'text-[#DA2E72]', Icon: XCircleIcon },
  warning: { bg: 'bg-[#F79A30]/10', text: 'text-[#F79A30]', Icon: ExclamationTriangleIcon },
  info: { bg: 'bg-[#50C8DF]/10', text: 'text-[#50C8DF]', Icon: BoltIcon },
};

function AttentionItem({ item }) {
  const s = SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.info;
  return (
    <Link to={item.link || '#'} className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-neutral-50 transition-colors">
      <div className={`p-1.5 rounded-lg ${s.bg}`}>
        <s.Icon className={`h-4 w-4 ${s.text}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-800">{item.label}</p>
        {item.detail && <p className="text-xs text-neutral-500">{item.detail}</p>}
      </div>
      <span className={`text-sm font-semibold ${s.text}`}>{item.count}</span>
    </Link>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────
function MainDashboard() {
  const { companyName, isMainBranch } = useCompanyName();
  const [stats, setStats] = useState({});
  const [submissions, setSubmissions] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [gghs, setGghs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feed, setFeed] = useState(null);
  const [feedLoading, setFeedLoading] = useState(true);

  useEffect(() => {
    // Original dashboard data
    const fetchAll = async () => {
      try {
        const [submissionsRes, pipelineRes, metricsRes, lessonsRes, cctRes] = await Promise.all([
          axios.get("/api/submissions?limit=10&sort=created_at&order=desc").catch(() => null),
          axios.get("/api/cct/stats/funnel").catch(() => null),
          axios.get("/api/company-metrics").catch(() => null),
          axios.get("/api/lessons-dashboard?period=this_week").catch(() => null),
          axios.get("/api/cct?status=prospect&limit=100").catch(() => null),
        ]);

        if (submissionsRes?.data) {
          const subs = Array.isArray(submissionsRes.data) ? submissionsRes.data : submissionsRes.data.submissions || [];
          setSubmissions(subs.slice(0, 8));
        }
        if (pipelineRes?.data && Array.isArray(pipelineRes.data)) {
          setPipeline(pipelineRes.data.filter(s => parseInt(s.client_count) > 0));
          const totalProspects = pipelineRes.data.reduce((sum, s) => sum + parseInt(s.client_count || 0), 0);
          setStats(prev => ({ ...prev, activeProspects: totalProspects }));
        }
        if (cctRes?.data) {
          const prospects = Array.isArray(cctRes.data) ? cctRes.data : cctRes.data.clients || [];
          const waitingToPair = prospects.filter(c =>
            !c.tutor_id && !c.contractor_id && (c.status === 'prospect' || c.pipeline_stage?.toLowerCase().includes('new'))
          ).length;
          setStats(prev => ({ ...prev, waitingToPair }));
        }
        if (metricsRes?.data?.metrics) {
          const handshakes = metricsRes.data.metrics.find(m => m.metric_key === "total_handshakes");
          if (handshakes) setGghs(parseInt(handshakes.current_value || handshakes.metric_value || 0));
        }
        if (lessonsRes?.data) {
          const lessons = Array.isArray(lessonsRes.data) ? lessonsRes.data : lessonsRes.data.lessons || [];
          setStats(prev => ({ ...prev, weekLessons: lessons.length, completedLessons: lessons.filter(l => l.status === 'complete' || l.status === 'completed').length }));
        }
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    // New feed data
    const fetchFeed = async () => {
      try {
        const res = await axios.get("/api/dashboard-feed");
        setFeed(res.data);
      } catch (err) {
        console.error("Feed fetch error:", err);
      } finally {
        setFeedLoading(false);
      }
    };

    fetchAll();
    fetchFeed();
  }, []);

  const skeleton = (rows = 5) => (
    <div className="space-y-3">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="animate-pulse flex items-center gap-3 py-2.5">
          <div className="w-7 h-7 bg-neutral-200 rounded-lg" />
          <div className="flex-1"><div className="h-4 bg-neutral-200 rounded w-3/4 mb-1" /><div className="h-3 bg-neutral-100 rounded w-1/2" /></div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900 font-heading">
          {isMainBranch ? "HQ Dashboard" : companyName}
        </h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {/* Row 1: Key Metrics — 4 cards + GGHS */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label="This Week's Lessons" value={stats.weekLessons ?? "—"}
          subtitle={stats.completedLessons != null ? `${stats.completedLessons} completed` : "This week"}
          icon={CalendarDaysIcon} to="/scheduling/lessons" color="#6A469D" loading={loading} />
        <StatCard label="Waiting to Pair" value={stats.waitingToPair ?? "—"}
          subtitle="Need tutor pairing" icon={UserPlusIcon} to="/pipeline/cct?reset=prospects" color="#F79A30" loading={loading} />
        <StatCard label="Active Prospects" value={stats.activeProspects ?? "—"}
          subtitle="In pipeline" icon={FunnelIcon} to="/pipeline/cct?reset=prospects" color="#34B256" loading={loading} />
        <StatCard label="Pipeline Stages" value={pipeline.length || "—"}
          subtitle={pipeline.length ? `${pipeline.length} active` : "CCT"} icon={ArrowTrendingUpIcon} to="/pipeline/cct" color="#50C8DF" loading={loading} />
        <div className="col-span-2 lg:col-span-1">
          <GghsCounter count={gghs} loading={loading} />
        </div>
      </div>

      {/* Row 2: Today's Lessons + Revenue + Needs Attention */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Today's Lessons */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <SectionHeader title="Today's Lessons" action="Calendar" actionTo="/scheduling" />
          {feedLoading ? skeleton(3) : feed?.todaysLessons ? (
            <>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[
                  { label: 'Total', value: feed.todaysLessons.total, color: '#6A469D' },
                  { label: 'Done', value: feed.todaysLessons.completed, color: '#34B256' },
                  { label: 'Pending', value: feed.todaysLessons.pending, color: '#F79A30' },
                  { label: 'Cancelled', value: feed.todaysLessons.cancelled, color: '#DA2E72' },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-[10px] text-neutral-500 uppercase tracking-wider">{s.label}</p>
                  </div>
                ))}
              </div>
              {feed.todaysLessons.upcoming?.length > 0 && (
                <div className="border-t border-neutral-100 pt-3 space-y-2">
                  <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Upcoming</p>
                  {feed.todaysLessons.upcoming.slice(0, 4).map(l => (
                    <div key={l.appointment_id} className="flex items-center justify-between text-sm">
                      <div className="truncate flex-1 mr-2">
                        <span className="text-neutral-800">{l.client_name || l.topic || `Lesson #${l.appointment_id}`}</span>
                        {l.tutor_name && <span className="text-neutral-400 text-xs ml-1">w/ {l.tutor_name}</span>}
                      </div>
                      <span className="text-xs text-neutral-500 whitespace-nowrap">
                        {DateTime.fromISO(l.start).toFormat('h:mm a')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : <p className="text-sm text-neutral-500">No lessons today</p>}
        </div>

        {/* Revenue This Week */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <SectionHeader title="Revenue This Week" action="Revenue" actionTo="/analytics/revenue" />
          {feedLoading ? skeleton(2) : feed?.revenue ? (
            <div className="space-y-4">
              <div>
                <p className="text-3xl font-bold text-neutral-900">{formatCurrency(feed.revenue.total_collected)}</p>
                <p className="text-sm text-neutral-500">collected of {formatCurrency(feed.revenue.total_invoiced)} invoiced</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center flex-1 bg-neutral-50 rounded-lg p-2">
                  <p className="text-lg font-semibold text-neutral-900">{feed.revenue.paid_count}</p>
                  <p className="text-[10px] text-neutral-500 uppercase">Paid</p>
                </div>
                <div className="text-center flex-1 bg-neutral-50 rounded-lg p-2">
                  <p className="text-lg font-semibold text-neutral-900">{feed.revenue.invoice_count - feed.revenue.paid_count}</p>
                  <p className="text-[10px] text-neutral-500 uppercase">Unpaid</p>
                </div>
              </div>
            </div>
          ) : <p className="text-sm text-neutral-500">No revenue data</p>}
        </div>

        {/* Needs Attention */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <SectionHeader title="Needs Attention" />
          {feedLoading ? skeleton(3) : feed?.needsAttention?.length > 0 ? (
            <div className="divide-y divide-neutral-100">
              {feed.needsAttention.map((item, i) => <AttentionItem key={i} item={item} />)}
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckCircleIcon className="h-8 w-8 text-[#34B256] mx-auto mb-2" />
              <p className="text-sm text-neutral-500">All clear — nothing needs attention</p>
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Activity Feed + Submissions + Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Live Activity Feed */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <SectionHeader title="Recent Activity" />
          {feedLoading ? skeleton(6) : feed?.activityFeed?.length > 0 ? (
            <div className="divide-y divide-neutral-100 max-h-[400px] overflow-y-auto">
              {feed.activityFeed.map((event, i) => <ActivityItem key={i} event={event} />)}
            </div>
          ) : (
            <p className="text-sm text-neutral-500 text-center py-8">No recent activity</p>
          )}
        </div>

        {/* Recent Submissions */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <SectionHeader title="Recent Submissions" action="View All" actionTo="/pipeline" />
          {loading ? skeleton(5) : submissions.length > 0 ? (
            <div className="divide-y divide-neutral-100">
              {submissions.map((sub, i) => <SubmissionRow key={sub.id || i} sub={sub} />)}
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckCircleIcon className="h-8 w-8 text-[#34B256] mx-auto mb-2" />
              <p className="text-sm text-neutral-500">All caught up</p>
            </div>
          )}
        </div>

        {/* Pipeline Snapshot */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <SectionHeader title="Pipeline Snapshot" action="Open CCT" actionTo="/pipeline/cct?reset=prospects" />
          {loading ? skeleton(5) : pipeline.length > 0 ? (
            <div className="divide-y divide-neutral-100">
              {pipeline.map((s, i) => <PipelineRow key={i} stage={s.stage_name} count={parseInt(s.client_count)} />)}
            </div>
          ) : (
            <div className="text-center py-8">
              <FunnelIcon className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
              <p className="text-sm text-neutral-500">No active pipeline stages</p>
            </div>
          )}
        </div>
      </div>

      {/* Row 4: Tutor Leaderboard + New Clients + Quick Nav */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {/* Tutor Leaderboard */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <SectionHeader title="Tutor Leaderboard (Today)" action="All Tutors" actionTo="/people/tutors" />
          {feedLoading ? skeleton(3) : feed?.tutorLeaderboard?.length > 0 ? (
            <div className="space-y-2">
              {feed.tutorLeaderboard.map((t, i) => (
                <div key={t.contractor_id} className="flex items-center gap-3 py-1.5">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? 'bg-[#FACC29]/20 text-[#C77A26]' : 'bg-neutral-100 text-neutral-500'
                  }`}>{i + 1}</span>
                  <span className="text-sm text-neutral-800 flex-1 truncate">{t.tutor_name}</span>
                  <span className="text-sm font-semibold text-[#6A469D]">{t.lessons_today}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500 text-center py-6">No lessons today yet</p>
          )}
        </div>

        {/* New Clients This Week */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <SectionHeader title="New Clients This Week" action="All Clients" actionTo="/pipeline/clients" />
          {feedLoading ? skeleton(3) : feed?.newClients ? (
            <>
              <p className="text-3xl font-bold text-neutral-900 mb-3">{feed.newClients.count}</p>
              {feed.newClients.clients?.length > 0 && (
                <div className="space-y-2">
                  {feed.newClients.clients.slice(0, 5).map(c => (
                    <div key={c.client_id} className="flex items-center justify-between text-sm">
                      <span className="text-neutral-800 truncate">{c.name?.trim() || 'Unknown'}</span>
                      <span className="text-xs text-neutral-400">{timeAgo(c.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-neutral-500 text-center py-6">No new clients this week</p>
          )}
        </div>

        {/* Quick Navigation */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <SectionHeader title="Quick Actions" />
          <div className="grid grid-cols-3 gap-2">
            {[
              { to: "/pipeline", icon: InboxIcon, label: "Booking Hub", color: "#F79A30" },
              { to: "/pipeline/cct?reset=prospects", icon: FunnelIcon, label: "Conversion", color: "#34B256" },
              { to: "/scheduling", icon: CalendarDaysIcon, label: "Calendar", color: "#6A469D" },
              { to: "/scheduling/job-builder", icon: BriefcaseIcon, label: "Create Job", color: "#50C8DF" },
              { to: "/people/tutors", icon: UserGroupIcon, label: "Tutors", color: "#2D2F8E" },
              { to: "/analytics", icon: ChartBarIcon, label: "Analytics", color: "#DA2E72" },
            ].map(({ to, icon: Icon, label, color }) => (
              <Link key={to} to={to}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg hover:bg-neutral-50 transition-colors group">
                <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}15` }}>
                  <Icon className="h-4 w-4" style={{ color }} />
                </div>
                <span className="text-[11px] font-medium text-neutral-600 group-hover:text-neutral-900 text-center">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Franchise Links */}
      {isMainBranch && (
        <div>
          <SectionHeader title="Franchise Network" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a href="https://westside.acmeops.com" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 bg-white rounded-xl border border-neutral-200 hover:shadow-sm transition-all">
              <BuildingOfficeIcon className="h-5 w-5 text-[#34B256]" />
              <span className="text-sm font-medium text-neutral-700">Westside Operations</span>
              <ArrowRightIcon className="h-4 w-4 text-neutral-300 ml-auto" />
            </a>
            <a href="https://eastside.acmeops.com" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 bg-white rounded-xl border border-neutral-200 hover:shadow-sm transition-all">
              <BuildingOfficeIcon className="h-5 w-5 text-[#F79A30]" />
              <span className="text-sm font-medium text-neutral-700">Eastside Operations</span>
              <ArrowRightIcon className="h-4 w-4 text-neutral-300 ml-auto" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default MainDashboard;
