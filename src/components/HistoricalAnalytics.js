import { useState, useEffect, useCallback, useRef } from "react";
import { DateTime } from "luxon";
import {
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  TrophyIcon,
  TableCellsIcon,
  ChartBarIcon,
  FunnelIcon,
} from "@heroicons/react/24/outline";

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Convert "Last, First" → "First Last"
function formatName(name) {
  if (!name) return "—";
  if (!name.includes(",")) return name;
  const [last, ...firstParts] = name.split(",");
  const first = firstParts.join(",").trim();
  return first ? `${first} ${last.trim()}` : last.trim();
}

// ─── Shared UI ───────────────────────────────────────────────────────────────

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function Section({ title, children, actions, className }) {
  return (
    <section className={cn("bg-white border border-neutral-200 rounded-xl shadow-sm", className)}>
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-neutral-100">
        <h3 className="text-base sm:text-lg font-semibold text-brand-navy font-heading">{title}</h3>
        {actions}
      </div>
      <div className="p-4 sm:px-6">{children}</div>
    </section>
  );
}

function KPICard({ label, value, subtitle }) {
  return (
    <div className="bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-100 rounded-lg p-4">
      <div className="text-xs font-medium text-neutral-600 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-xl sm:text-2xl font-bold text-brand-navy">{value}</div>
      {subtitle && <div className="text-xs text-neutral-500 mt-1">{subtitle}</div>}
    </div>
  );
}

function SourceBadge({ source }) {
  const colors = {
    mindbody: "bg-blue-100 text-blue-800",
    e4: "bg-emerald-100 text-emerald-800",
    tutorcruncher: "bg-purple-100 text-purple-800",
  };
  const labels = { mindbody: "MindBody", e4: "E4", tutorcruncher: "TutorCruncher" };
  return (
    <span className={cn("inline-flex px-2 py-0.5 rounded text-xs font-medium", colors[source] || "bg-neutral-100 text-neutral-800")}>
      {labels[source] || source}
    </span>
  );
}

function StatusBadge({ status }) {
  const colors = {
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
    no_show: "bg-amber-100 text-amber-800",
    late_cancel: "bg-orange-100 text-orange-800",
    pending: "bg-blue-100 text-blue-800",
  };
  return (
    <span className={cn("inline-flex px-2 py-0.5 rounded text-xs font-medium", colors[status] || "bg-neutral-100 text-neutral-800")}>
      {status || "—"}
    </span>
  );
}

// ─── Tab Navigation ──────────────────────────────────────────────────────────

const TABS = [
  { key: "data-explorer", label: "Data Explorer", icon: TableCellsIcon },
  { key: "hall-of-fame", label: "Hall of Fame", icon: TrophyIcon },
  { key: "handshakes", label: "Handshakes", icon: ChartBarIcon },
];

function TabNav({ activeTab, onChange }) {
  return (
    <div className="flex border-b border-neutral-200 mb-6">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors touch-manipulation",
              active
                ? "border-brand-purple text-brand-purple"
                : "border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300"
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Animated Counter ────────────────────────────────────────────────────────

function useAnimatedNumber(target, duration = 2000) {
  const [current, setCurrent] = useState(0);
  const startRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!target || target <= 0) { setCurrent(0); return; }
    startRef.current = performance.now();
    const from = current;

    function tick(now) {
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(from + (target - from) * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  return current;
}

// ─── Hall of Fame ────────────────────────────────────────────────────────────

function HallOfFame() {
  const [metrics, setMetrics] = useState(null);
  const [velocity, setVelocity] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [milestones, setMilestones] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const opts = { credentials: "include" };

    Promise.all([
      fetch("/api/company-metrics", opts).then((r) => r.json()),
      fetch("/api/historical-analytics/velocity", opts).then((r) => r.json()),
      fetch("/api/historical-analytics/timeline", opts).then((r) => r.json()),
      fetch("/api/historical-analytics/milestones", opts).then((r) => r.json()),
    ])
      .then(([m, v, t, ms]) => {
        setMetrics(m);
        setVelocity(v);
        setTimeline(t);
        setMilestones(ms);
      })
      .catch((e) => console.error("Hall of Fame load error:", e))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
        <span className="ml-3 text-neutral-600">Loading Hall of Fame...</span>
      </div>
    );
  }

  const handshakes = metrics?.metrics?.find((m) => m.metric_key === "total_handshakes");
  // Use whichever is higher: company_metrics (base + TC delta) or velocity (historical + TC count)
  const metricsTotal = handshakes?.total || 0;
  const velocityTotal = velocity?.total || 0;
  const totalGGHS = Math.max(metricsTotal, velocityTotal);

  return (
    <div className="space-y-6">
      <GGHSCounter total={totalGGHS} velocity={velocity} />
      <EraTimeline timeline={timeline} milestones={milestones} />
      <GrowthChart timeline={timeline} />
      <ContributionHeatmap />
      <LocationBreakdown milestones={milestones} />
    </div>
  );
}

// ─── GGHS Counter ────────────────────────────────────────────────────────────

function GGHSCounter({ total, velocity }) {
  const animatedTotal = useAnimatedNumber(total, 2500);

  const projectedMonth = velocity?.projected_date
    ? DateTime.fromISO(velocity.projected_date).toFormat("MMMM yyyy")
    : null;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-navy via-brand-purple to-indigo-900 text-white p-8 sm:p-12 text-center">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: "radial-gradient(circle at 25% 25%, white 1px, transparent 1px), radial-gradient(circle at 75% 75%, white 1px, transparent 1px)",
          backgroundSize: "40px 40px"
        }} />
      </div>

      <div className="relative">
        <div className="text-sm font-medium text-purple-200 uppercase tracking-widest mb-3">
          Lifetime Good Game Handshakes
        </div>
        <div className="text-5xl sm:text-7xl lg:text-8xl font-bold tabular-nums tracking-tight mb-2">
          {animatedTotal.toLocaleString()}
        </div>
        <div className="text-lg text-purple-200 mb-6">
          and counting
          <span className="inline-block w-2 h-2 bg-green-400 rounded-full ml-2 animate-pulse" />
        </div>

        {velocity && velocity.per_day > 0 && (
          <div className="flex flex-wrap justify-center gap-4 sm:gap-8 text-sm">
            <div className="bg-white/10 backdrop-blur rounded-lg px-4 py-2">
              <div className="text-purple-200 text-xs">Daily Pace</div>
              <div className="font-bold text-lg">{velocity.per_day}/day</div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-lg px-4 py-2">
              <div className="text-purple-200 text-xs">Last 30 Days</div>
              <div className="font-bold text-lg">{velocity.last_30_days?.toLocaleString()}</div>
            </div>
            {projectedMonth && (
              <div className="bg-white/10 backdrop-blur rounded-lg px-4 py-2">
                <div className="text-purple-200 text-xs">1 Million By</div>
                <div className="font-bold text-lg">{projectedMonth}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Era Timeline ────────────────────────────────────────────────────────────

function EraTimeline({ timeline, milestones }) {
  if (!timeline?.eras || !milestones?.milestones) return null;

  const eras = timeline.eras;

  // Sum completed per era from timeline data
  const eraCompletedMap = {};
  for (const row of (timeline.months || [])) {
    if (!eraCompletedMap[row.source_system]) eraCompletedMap[row.source_system] = 0;
    eraCompletedMap[row.source_system] += row.completed || 0;
  }

  // Get total for proportional widths
  const totalCompleted = Object.values(eraCompletedMap).reduce((a, b) => a + b, 0) || 1;

  return (
    <Section title="The Journey — Timeline">
      {/* Era bars */}
      <div className="flex rounded-lg overflow-hidden h-10 mb-2">
        {eras.map((era) => {
          const count = eraCompletedMap[era.key] || 0;
          const pct = Math.max(5, (count / totalCompleted) * 100);
          return (
            <div
              key={era.key}
              className="transition-all"
              style={{ width: `${pct}%`, backgroundColor: era.color }}
              title={`${era.label}: ${count.toLocaleString()} completed lessons`}
            />
          );
        })}
      </div>
      {/* Era labels centered under their bar segments */}
      <div className="flex mb-6">
        {eras.map((era) => {
          const count = eraCompletedMap[era.key] || 0;
          const pct = Math.max(5, (count / totalCompleted) * 100);
          return (
            <div key={era.key} className="text-center" style={{ width: `${pct}%` }}>
              <div className="text-sm font-bold" style={{ color: era.color }}>{era.label}</div>
              <div className="text-xs text-neutral-500">{count.toLocaleString()} GGHS</div>
            </div>
          );
        })}
      </div>

      {/* Milestone markers */}
      <div className="flex flex-wrap gap-3">
        {milestones.milestones.map((ms) => (
          <div
            key={ms.threshold}
            className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-xs"
          >
            <span className="text-amber-600 font-bold">{ms.label}</span>
            <span className="text-neutral-600">
              {DateTime.fromFormat(ms.month, "yyyy-MM").toFormat("MMM yyyy")}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Growth Chart ────────────────────────────────────────────────────────────

function GrowthChart({ timeline }) {
  if (!timeline?.months?.length) return null;

  // Aggregate by month (combine source systems)
  const monthMap = {};
  for (const row of timeline.months) {
    if (!monthMap[row.month]) monthMap[row.month] = { month: row.month, mindbody: 0, e4: 0, tutorcruncher: 0, total: 0 };
    monthMap[row.month][row.source_system] = row.completed || 0;
    monthMap[row.month].total += row.completed || 0;
  }
  const chartData = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));

  // Lazy load recharts
  const [Recharts, setRecharts] = useState(null);
  useEffect(() => {
    import("recharts").then(setRecharts);
  }, []);

  if (!Recharts) return <Section title="Growth Over Time"><div className="h-64 flex items-center justify-center text-neutral-400">Loading chart...</div></Section>;

  const { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } = Recharts;

  return (
    <Section title="Growth Over Time — Monthly Completed Lessons">
      <div className="h-72 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10 }}
              tickFormatter={(m) => {
                const [y, mo] = m.split("-");
                return mo === "01" || mo === "07" ? `${["Jan","","","","","","Jul"][parseInt(mo)-1]} ${y.slice(2)}` : "";
              }}
              interval={0}
            />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
            <Tooltip
              labelFormatter={(m) => DateTime.fromFormat(m, "yyyy-MM").toFormat("MMMM yyyy")}
              formatter={(value, name) => [value.toLocaleString(), name === "mindbody" ? "MindBody" : name === "e4" ? "E4" : "TutorCruncher"]}
            />
            <Area type="monotone" dataKey="mindbody" stackId="1" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.6} />
            <Area type="monotone" dataKey="e4" stackId="1" stroke="#10B981" fill="#10B981" fillOpacity={0.6} />
            <Area type="monotone" dataKey="tutorcruncher" stackId="1" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.6} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-center gap-6 mt-3">
        <div className="flex items-center gap-2 text-xs"><div className="w-3 h-3 rounded bg-blue-500" /> MindBody</div>
        <div className="flex items-center gap-2 text-xs"><div className="w-3 h-3 rounded bg-emerald-500" /> E4</div>
        <div className="flex items-center gap-2 text-xs"><div className="w-3 h-3 rounded bg-purple-500" /> TutorCruncher</div>
      </div>
    </Section>
  );
}

// ─── Contribution Heatmap ────────────────────────────────────────────────────

function ContributionHeatmap() {
  const [heatmapData, setHeatmapData] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [hoveredDay, setHoveredDay] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedYear) params.set("year", selectedYear);

    fetch(`/api/historical-analytics/heatmap?${params}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setHeatmapData(data);
        // Default to most recent year
        if (!selectedYear && data.available_years?.length) {
          setSelectedYear(data.available_years[data.available_years.length - 1]);
        }
      })
      .catch((e) => console.error("Heatmap load error:", e))
      .finally(() => setLoading(false));
  }, [selectedYear]);

  if (loading && !heatmapData) {
    return (
      <Section title="Lesson Activity">
        <div className="h-40 flex items-center justify-center text-neutral-400">Loading heatmap...</div>
      </Section>
    );
  }

  if (!heatmapData?.days?.length) return null;

  // Build day map for quick lookup
  const dayMap = {};
  let maxCount = 0;
  for (const d of heatmapData.days) {
    dayMap[d.day] = d.count;
    if (d.count > maxCount) maxCount = d.count;
  }

  // Build weeks grid for the selected year
  const year = selectedYear || new Date().getFullYear();
  const startDate = new Date(year, 0, 1);
  // Align to Sunday
  const startDay = startDate.getDay();
  const gridStart = new Date(startDate);
  gridStart.setDate(gridStart.getDate() - startDay);

  const weeks = [];
  let current = new Date(gridStart);
  const endDate = new Date(year, 11, 31);

  while (current <= endDate || weeks.length < 53) {
    const week = [];
    for (let dow = 0; dow < 7; dow++) {
      const dateStr = current.toISOString().split("T")[0];
      const inYear = current.getFullYear() === year;
      week.push({
        date: dateStr,
        count: inYear ? (dayMap[dateStr] || 0) : 0,
        inYear,
      });
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
    if (current.getFullYear() > year && current.getDay() === 0) break;
  }

  // Color scale (5 levels like GitHub)
  const getColor = (count) => {
    if (count === 0) return "bg-neutral-100";
    const ratio = count / maxCount;
    if (ratio < 0.15) return "bg-purple-200";
    if (ratio < 0.35) return "bg-purple-300";
    if (ratio < 0.6) return "bg-purple-500";
    return "bg-purple-700";
  };

  const monthLabels = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const firstInYear = week.find((d) => d.inYear);
    if (firstInYear) {
      const m = new Date(firstInYear.date).getMonth();
      if (m !== lastMonth) {
        monthLabels.push({ month: m, weekIdx: wi });
        lastMonth = m;
      }
    }
  });

  const totalForYear = heatmapData.days
    .filter((d) => d.day.startsWith(String(year)))
    .reduce((sum, d) => sum + d.count, 0);

  return (
    <Section
      title="Lesson Activity"
      actions={
        <div className="flex items-center gap-2">
          <select
            value={selectedYear || ""}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="px-2 py-1 text-xs border border-neutral-200 rounded-md"
          >
            {heatmapData.available_years?.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <span className="text-xs text-neutral-500">{totalForYear.toLocaleString()} lessons</span>
        </div>
      }
    >
      <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
        {/* Month labels */}
        <div className="flex ml-8 mb-1">
          {monthLabels.map((ml) => (
            <div
              key={ml.month}
              className="text-[10px] text-neutral-500"
              style={{ position: "relative", left: `${ml.weekIdx * 14}px` }}
            >
              {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][ml.month]}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex gap-[2px]">
          {/* Day of week labels */}
          <div className="flex flex-col gap-[2px] mr-1 pt-0">
            {["", "Mon", "", "Wed", "", "Fri", ""].map((d, i) => (
              <div key={i} className="h-[12px] text-[9px] text-neutral-400 leading-[12px] w-6 text-right pr-1">{d}</div>
            ))}
          </div>

          {/* Weeks */}
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[2px]">
              {week.map((day, di) => (
                <div
                  key={day.date}
                  className={cn(
                    "w-[12px] h-[12px] rounded-[2px] transition-colors",
                    day.inYear ? getColor(day.count) : "bg-transparent",
                    day.inYear && day.count > 0 && "cursor-pointer hover:ring-1 hover:ring-purple-400"
                  )}
                  onMouseEnter={() => day.inYear && day.count > 0 && setHoveredDay(day)}
                  onMouseLeave={() => setHoveredDay(null)}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Tooltip */}
        {hoveredDay && (
          <div className="mt-2 text-xs text-neutral-600">
            <span className="font-medium">{hoveredDay.count} lessons</span>
            {" on "}
            {DateTime.fromISO(hoveredDay.date).toFormat("EEEE, MMMM d, yyyy")}
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-1 mt-3 text-[10px] text-neutral-500">
          <span>Less</span>
          <div className="w-[12px] h-[12px] rounded-[2px] bg-neutral-100" />
          <div className="w-[12px] h-[12px] rounded-[2px] bg-purple-200" />
          <div className="w-[12px] h-[12px] rounded-[2px] bg-purple-300" />
          <div className="w-[12px] h-[12px] rounded-[2px] bg-purple-500" />
          <div className="w-[12px] h-[12px] rounded-[2px] bg-purple-700" />
          <span>More</span>
        </div>
      </div>
    </Section>
  );
}

// ─── Location Breakdown ──────────────────────────────────────────────────────

function LocationBreakdown({ milestones }) {
  if (!milestones?.location_breakdown?.length) return null;

  // Aggregate by location_category, stacked by source
  const locMap = {};
  for (const row of milestones.location_breakdown) {
    if (!locMap[row.location_category]) locMap[row.location_category] = { location: row.location_category, mindbody: 0, e4: 0, tutorcruncher: 0, total: 0 };
    locMap[row.location_category][row.source_system] = row.completed || 0;
    locMap[row.location_category].total += row.completed || 0;
  }
  const locations = Object.values(locMap).sort((a, b) => b.total - a.total);
  const maxTotal = locations[0]?.total || 1;

  return (
    <Section title="GGHS by Market">
      <div className="space-y-3">
        {locations.map((loc) => {
          const mbPct = (loc.mindbody / maxTotal) * 100;
          const e4Pct = (loc.e4 / maxTotal) * 100;
          const tcPct = (loc.tutorcruncher / maxTotal) * 100;
          return (
            <div key={loc.location} className="flex items-center gap-3">
              <div className="w-28 sm:w-36 text-sm text-neutral-700 font-medium truncate">{loc.location}</div>
              <div className="flex-1 flex h-7 rounded-md overflow-hidden bg-neutral-100">
                {mbPct > 0 && <div className="bg-blue-500 transition-all" style={{ width: `${mbPct}%` }} title={`MindBody: ${loc.mindbody.toLocaleString()}`} />}
                {e4Pct > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${e4Pct}%` }} title={`E4: ${loc.e4.toLocaleString()}`} />}
                {tcPct > 0 && <div className="bg-purple-500 transition-all" style={{ width: `${tcPct}%` }} title={`TC: ${loc.tutorcruncher.toLocaleString()}`} />}
              </div>
              <div className="w-20 text-right text-sm font-medium text-neutral-800">{loc.total.toLocaleString()}</div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ─── Leaderboards Placeholder ────────────────────────────────────────────────

// ─── Leaderboards Tab ────────────────────────────────────────────────────────

function Leaderboards() {
  const [activeBoard, setActiveBoard] = useState("tutors");
  const [tutors, setTutors] = useState(null);
  const [clients, setClients] = useState(null);
  const [locations, setLocations] = useState(null);
  const [achievements, setAchievements] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const opts = { credentials: "include" };

    Promise.all([
      fetch("/api/historical-analytics/leaderboard/tutors?limit=50", opts).then((r) => r.json()),
      fetch("/api/historical-analytics/leaderboard/clients?limit=50", opts).then((r) => r.json()),
      fetch("/api/historical-analytics/leaderboard/locations", opts).then((r) => r.json()),
      fetch("/api/historical-analytics/achievements", opts).then((r) => r.json()),
    ])
      .then(([t, c, l, a]) => {
        setTutors(t.tutors || []);
        setClients(c.clients || []);
        setLocations(l.locations || []);
        setAchievements(a.achievements || []);
      })
      .catch((e) => console.error("Leaderboard load error:", e))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
        <span className="ml-3 text-neutral-600">Loading leaderboards...</span>
      </div>
    );
  }

  const boards = [
    { key: "tutors", label: "Tutors" },
    { key: "clients", label: "Clients" },
    { key: "locations", label: "Markets" },
    { key: "achievements", label: "Records" },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-tab navigation */}
      <div className="flex gap-2 flex-wrap">
        {boards.map((b) => (
          <button
            key={b.key}
            onClick={() => setActiveBoard(b.key)}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium transition-colors",
              activeBoard === b.key
                ? "bg-brand-purple text-white"
                : "bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-50"
            )}
          >
            {b.label}
          </button>
        ))}
      </div>

      {activeBoard === "tutors" && <TutorLeaderboard tutors={tutors} />}
      {activeBoard === "clients" && <ClientLeaderboard clients={clients} />}
      {activeBoard === "locations" && <LocationLeaderboard locations={locations} />}
      {activeBoard === "achievements" && <AchievementsBoard achievements={achievements} />}
    </div>
  );
}

function RankBadge({ rank }) {
  if (rank === 1) return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-400 text-white text-xs font-bold">1</span>;
  if (rank === 2) return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-neutral-300 text-white text-xs font-bold">2</span>;
  if (rank === 3) return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-700 text-white text-xs font-bold">3</span>;
  return <span className="inline-flex items-center justify-center w-7 h-7 text-xs text-neutral-500 font-medium">{rank}</span>;
}

function TutorLeaderboard({ tutors }) {
  const [search, setSearch] = useState("");
  const filtered = search
    ? tutors.filter((t) => t.tutor_name.toLowerCase().includes(search.toLowerCase()))
    : tutors;

  return (
    <Section
      title="All-Time Tutor Leaderboard"
      actions={
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tutor..."
            className="pl-7 pr-3 py-1 text-xs border border-neutral-200 rounded-md w-48"
          />
        </div>
      }
    >
      <div className="overflow-x-auto -mx-4 sm:-mx-6">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-600 border-b border-neutral-200">
              <th className="py-2 px-3 w-10">#</th>
              <th className="py-2 px-3">Tutor</th>
              <th className="py-2 px-3 text-right">Lessons</th>
              <th className="py-2 px-3 text-right">Hours</th>
              <th className="py-2 px-3 text-right">Years</th>
              <th className="py-2 px-3">Sources</th>
              <th className="py-2 px-3">Active</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t, i) => (
              <tr key={t.tutor_name} className={cn("border-t border-neutral-100", i < 3 && "bg-amber-50/30")}>
                <td className="py-2.5 px-3"><RankBadge rank={i + 1} /></td>
                <td className="py-2.5 px-3 font-medium text-neutral-900">
                  {formatName(t.tutor_name)}
                  {t.tc_contractor_id && (
                    <a
                      href={`https://account.acmeops.com/contractors/${t.tc_contractor_id}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-xs text-brand-purple hover:text-brand-navy"
                      title="View in TutorCruncher"
                    >
                      TC↗
                    </a>
                  )}
                </td>
                <td className="py-2.5 px-3 text-right font-medium">{Number(t.lessons).toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right text-neutral-600">{Number(t.hours).toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right text-neutral-600">{t.years_active}</td>
                <td className="py-2.5 px-3">
                  <div className="flex gap-1">
                    {t.eras?.map((era) => <SourceBadge key={era} source={era} />)}
                  </div>
                </td>
                <td className="py-2.5 px-3 text-xs text-neutral-500">
                  {t.first_lesson?.slice(0, 7)} → {t.last_lesson?.slice(0, 7)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function ClientLeaderboard({ clients }) {
  const [search, setSearch] = useState("");
  const [clientType, setClientType] = useState("family");

  const filtered = (clients || [])
    .filter((c) => c.client_type === clientType)
    .filter((c) => !search || c.client_name.toLowerCase().includes(search.toLowerCase()));

  const familyCount = (clients || []).filter(c => c.client_type === 'family').length;
  const orgCount = (clients || []).filter(c => c.client_type === 'organization').length;

  return (
    <Section
      title={clientType === "family" ? "All-Time Family Leaderboard" : "All-Time Organization Leaderboard"}
      actions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="pl-7 pr-3 py-1 text-xs border border-neutral-200 rounded-md w-40"
            />
          </div>
        </div>
      }
    >
      {/* Category toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setClientType("family")}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            clientType === "family"
              ? "bg-brand-purple text-white"
              : "bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-50"
          )}
        >
          Families ({familyCount})
        </button>
        <button
          onClick={() => setClientType("organization")}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            clientType === "organization"
              ? "bg-brand-purple text-white"
              : "bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-50"
          )}
        >
          Schools & Organizations ({orgCount})
        </button>
      </div>

      <div className="overflow-x-auto -mx-4 sm:-mx-6">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-600 border-b border-neutral-200">
              <th className="py-2 px-3 w-10">#</th>
              <th className="py-2 px-3">{clientType === "family" ? "Family" : "Organization"}</th>
              <th className="py-2 px-3 text-right">Lessons</th>
              <th className="py-2 px-3 text-right">Revenue</th>
              <th className="py-2 px-3 text-right">Years</th>
              <th className="py-2 px-3">Sources</th>
              <th className="py-2 px-3">Active</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={c.client_name} className={cn("border-t border-neutral-100", i < 3 && "bg-amber-50/30")}>
                <td className="py-2.5 px-3"><RankBadge rank={i + 1} /></td>
                <td className="py-2.5 px-3 font-medium text-neutral-900 max-w-[200px] truncate">{formatName(c.client_name)}</td>
                <td className="py-2.5 px-3 text-right font-medium">{Number(c.lessons).toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right text-neutral-600">
                  {Number(c.revenue) > 0 ? `$${Number(c.revenue).toLocaleString()}` : "—"}
                </td>
                <td className="py-2.5 px-3 text-right text-neutral-600">{c.years_active}</td>
                <td className="py-2.5 px-3">
                  <div className="flex gap-1">
                    {c.eras?.map((era) => <SourceBadge key={era} source={era} />)}
                  </div>
                </td>
                <td className="py-2.5 px-3 text-xs text-neutral-500">
                  {c.first_lesson?.slice(0, 7)} → {c.last_lesson?.slice(0, 7)}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-neutral-500">No results</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function LocationLeaderboard({ locations }) {
  if (!locations?.length) return null;
  const maxLessons = locations[0]?.lessons || 1;

  return (
    <Section title="Market Leaderboard">
      <div className="space-y-3">
        {locations.map((loc, i) => (
          <div key={loc.location_category} className="flex items-center gap-3">
            <div className="w-8"><RankBadge rank={i + 1} /></div>
            <div className="w-28 sm:w-36 text-sm font-medium text-neutral-700 truncate">{loc.location_category}</div>
            <div className="flex-1 h-8 bg-neutral-100 rounded-md overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-brand-purple to-purple-400 rounded-md transition-all"
                style={{ width: `${(loc.lessons / maxLessons) * 100}%` }}
              />
              <div className="absolute inset-0 flex items-center px-3 text-xs font-medium">
                <span className={loc.lessons / maxLessons > 0.3 ? "text-white" : "text-neutral-700"}>
                  {Number(loc.lessons).toLocaleString()} lessons
                </span>
              </div>
            </div>
            <div className="w-24 text-right text-xs text-neutral-500">
              {Number(loc.lessons_per_month).toLocaleString()}/mo
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function AchievementsBoard({ achievements }) {
  if (!achievements?.length) return null;

  const icons = {
    fire: "🔥",
    calendar: "📅",
    chart: "📊",
    star: "⭐",
    heart: "❤️",
  };

  return (
    <Section title="All-Time Records">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {achievements.map((a, i) => (
          <div key={i} className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4">
            <div className="text-2xl mb-2">{icons[a.icon] || "🏆"}</div>
            <div className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">{a.title}</div>
            <div className="text-lg font-bold text-neutral-900">{a.value.includes(",") ? formatName(a.value) : a.value}</div>
            <div className="text-xs text-neutral-600 mt-1">{a.detail}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Data Explorer ───────────────────────────────────────────────────────────

function DataExplorer() {
  const [filters, setFilters] = useState({
    sourceSystem: "",
    status: "",
    startDate: "2016-01-01",
    endDate: new Date().toISOString().split("T")[0],
    location: "",
    locationCategory: "",
    division: "",
    tutor: "",
    client: "",
  });
  const [filterOptions, setFilterOptions] = useState(null);
  const [data, setData] = useState({ rows: [], pagination: {}, summary: {} });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [sortBy, setSortBy] = useState("appointment_date");
  const [sortOrder, setSortOrder] = useState("desc");
  const [showFilters, setShowFilters] = useState(true);
  const debounceRef = useRef(null);
  // Separate display values for text inputs (updates instantly for UI)
  // vs applied filters (updates after debounce for API calls)
  const [tutorInput, setTutorInput] = useState("");
  const [clientInput, setClientInput] = useState("");

  // Fetch filter options on mount
  useEffect(() => {
    fetch("/api/historical-analytics/details/filters", { credentials: "include" })
      .then((r) => r.json())
      .then(setFilterOptions)
      .catch((e) => console.error("Failed to load filters:", e));
  }, []);

  // Fetch data when filters/page/sort change
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        sortOrder,
      });

      // Add active filters
      Object.entries(filters).forEach(([key, val]) => {
        if (val) params.set(key, val);
      });

      const resp = await fetch(`/api/historical-analytics/details?${params}`, {
        credentials: "include",
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      setData(json);
    } catch (e) {
      console.error("Failed to fetch data:", e);
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize, sortBy, sortOrder]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Debounced filter updates for text inputs
  const updateFilter = (key, value) => {
    if (key === "tutor" || key === "client") {
      // Update display value immediately (responsive typing)
      if (key === "tutor") setTutorInput(value);
      else setClientInput(value);
      // Debounce the actual filter application (triggers API fetch)
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setFilters((f) => ({ ...f, [key]: value }));
        setPage(1);
      }, 500);
    } else {
      setFilters((f) => ({ ...f, [key]: value }));
      setPage(1);
    }
  };

  const applyEraPreset = (preset) => {
    setFilters((f) => ({
      ...f,
      startDate: preset.startDate,
      endDate: preset.endDate,
    }));
    setPage(1);
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortOrder("desc");
    }
    setPage(1);
  };

  const sortIcon = (column) => {
    if (sortBy !== column) return null;
    return sortOrder === "asc" ? " ↑" : " ↓";
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, val]) => {
      if (val) params.set(key, val);
    });
    // Open CSV in new tab (browser will download — cookie auth used)
    window.open(`/api/historical-analytics/details/export?${params}`, "_blank");
  };

  const fmtDate = (d) => {
    if (!d) return "";
    try {
      return DateTime.fromISO(d, { zone: "utc" }).setZone("America/New_York").toFormat("M/d/yyyy");
    } catch {
      return String(d);
    }
  };

  const fmtCurrency = (v) => {
    if (v == null) return "$0";
    return `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const { rows = [], pagination = {}, summary = {} } = data;

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <KPICard label="Total Lessons" value={Number(summary.total_lessons || 0).toLocaleString()} />
        <KPICard label="Total Hours" value={Number(summary.total_hours || 0).toLocaleString()} />
        <KPICard label="Revenue" value={fmtCurrency(summary.total_revenue)} />
        <KPICard label="Tutor Pay" value={fmtCurrency(summary.total_tutor_pay)} />
        <KPICard label="Gross Profit" value={fmtCurrency(summary.total_gross_profit)} />
        <KPICard label="Unique Tutors" value={Number(summary.unique_tutors || 0).toLocaleString()} />
        <KPICard label="Unique Clients" value={Number(summary.unique_clients || 0).toLocaleString()} />
      </div>

      {/* Filter Bar */}
      <Section
        title="Filters"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters((s) => !s)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-neutral-600 hover:text-neutral-800 rounded"
            >
              <FunnelIcon className="h-4 w-4" />
              {showFilters ? "Hide" : "Show"}
            </button>
            <button
              onClick={handleExport}
              disabled={!pagination.totalRows}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-brand-purple text-white rounded-md hover:bg-purple-700 disabled:bg-neutral-300 disabled:cursor-not-allowed"
            >
              <ArrowDownTrayIcon className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
        }
      >
        {showFilters && (
          <div className="space-y-3">
            {/* Era presets */}
            {filterOptions?.eraPresets && (
              <div className="flex flex-wrap gap-2">
                {filterOptions.eraPresets.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => applyEraPreset(preset)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                      filters.startDate === preset.startDate && filters.endDate === preset.endDate
                        ? "bg-brand-purple text-white border-brand-purple"
                        : "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50"
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}

            {/* Filter row 1: dropdowns */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Source System</label>
                <select
                  value={filters.sourceSystem}
                  onChange={(e) => updateFilter("sourceSystem", e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-neutral-200 rounded-md"
                >
                  <option value="">All Sources</option>
                  {filterOptions?.sourceSystems?.map((s) => (
                    <option key={s} value={s}>{s === "mindbody" ? "MindBody" : s === "e4" ? "E4" : s === "tutorcruncher" ? "TutorCruncher" : s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => updateFilter("status", e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-neutral-200 rounded-md"
                >
                  <option value="">All Statuses</option>
                  {filterOptions?.statuses?.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Market</label>
                <select
                  value={filters.locationCategory}
                  onChange={(e) => updateFilter("locationCategory", e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-neutral-200 rounded-md"
                >
                  <option value="">All Markets</option>
                  {filterOptions?.locationCategories?.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Division</label>
                <select
                  value={filters.division}
                  onChange={(e) => updateFilter("division", e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-neutral-200 rounded-md"
                >
                  <option value="">All Divisions</option>
                  {filterOptions?.divisions?.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Start Date</label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => updateFilter("startDate", e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-neutral-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">End Date</label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => updateFilter("endDate", e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-neutral-200 rounded-md"
                />
              </div>
            </div>

            {/* Filter row 2: search inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <input
                  type="text"
                  value={tutorInput}
                  onChange={(e) => updateFilter("tutor", e.target.value)}
                  placeholder="Search tutor name..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-neutral-200 rounded-md"
                />
              </div>
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <input
                  type="text"
                  value={clientInput}
                  onChange={(e) => updateFilter("client", e.target.value)}
                  placeholder="Search client name..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-neutral-200 rounded-md"
                />
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* Results Table */}
      <Section
        title="Results"
        actions={
          <div className="text-xs text-neutral-500">
            {pagination.totalRows != null
              ? `Showing ${((page - 1) * pageSize + 1).toLocaleString()}–${Math.min(page * pageSize, pagination.totalRows).toLocaleString()} of ${pagination.totalRows.toLocaleString()}`
              : "Loading..."}
          </div>
        }
      >
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600" />
            <span className="ml-2 text-sm text-neutral-600">Loading...</span>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto -mx-4 sm:-mx-6">
              <table className="min-w-full text-sm" style={{ minWidth: "1100px" }}>
                <thead>
                  <tr className="text-left text-neutral-600 border-b border-neutral-200">
                    {[
                      { key: "appointment_date", label: "Date" },
                      { key: "start_time", label: "Time" },
                      { key: null, label: "Tutor" },
                      { key: null, label: "Client" },
                      { key: "revenue", label: "Revenue" },
                      { key: "tutor_pay", label: "Tutor Pay" },
                      { key: "gross_profit", label: "Profit" },
                      { key: "duration_hours", label: "Hours" },
                      { key: null, label: "Division" },
                      { key: "location", label: "Location" },
                      { key: "status", label: "Status" },
                      { key: "source_system", label: "Source" },
                    ].map((col) => (
                      <th
                        key={col.label}
                        onClick={col.key ? () => handleSort(col.key) : undefined}
                        className={cn(
                          "py-2 px-3 text-xs font-medium whitespace-nowrap",
                          col.key && "cursor-pointer hover:bg-neutral-50 select-none"
                        )}
                      >
                        {col.label}
                        {col.key && sortIcon(col.key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={row.id || idx} className="border-t border-neutral-100 hover:bg-neutral-50">
                      <td className="py-2 px-3 whitespace-nowrap">{fmtDate(row.appointment_date)}</td>
                      <td className="py-2 px-3 whitespace-nowrap text-neutral-600">{row.start_time ? String(row.start_time).slice(0, 5) : ""}</td>
                      <td className="py-2 px-3 max-w-[160px] truncate" title={formatName(row.tutor_name)}>{formatName(row.tutor_name)}</td>
                      <td className="py-2 px-3 max-w-[160px] truncate" title={formatName(row.client_name)}>{formatName(row.client_name)}</td>
                      <td className="py-2 px-3 whitespace-nowrap">{fmtCurrency(row.revenue)}</td>
                      <td className="py-2 px-3 whitespace-nowrap">{fmtCurrency(row.tutor_pay)}</td>
                      <td className="py-2 px-3 whitespace-nowrap">{fmtCurrency(row.gross_profit)}</td>
                      <td className="py-2 px-3 whitespace-nowrap">{row.duration_hours ? Number(row.duration_hours).toFixed(1) : "—"}</td>
                      <td className="py-2 px-3 whitespace-nowrap text-neutral-600">{row.division || "—"}</td>
                      <td className="py-2 px-3 whitespace-nowrap text-neutral-600">{row.location || "—"}</td>
                      <td className="py-2 px-3 whitespace-nowrap"><StatusBadge status={row.status} /></td>
                      <td className="py-2 px-3 whitespace-nowrap"><SourceBadge source={row.source_system} /></td>
                    </tr>
                  ))}
                  {rows.length === 0 && !loading && (
                    <tr>
                      <td colSpan={12} className="py-12 text-center text-neutral-500">No results match your filters</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-neutral-100 mt-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm border border-neutral-200 rounded-md hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                  Previous
                </button>
                <div className="flex items-center gap-2">
                  {/* Show page numbers */}
                  {Array.from({ length: Math.min(7, pagination.totalPages) }, (_, i) => {
                    let pageNum;
                    if (pagination.totalPages <= 7) {
                      pageNum = i + 1;
                    } else if (page <= 4) {
                      pageNum = i + 1;
                    } else if (page >= pagination.totalPages - 3) {
                      pageNum = pagination.totalPages - 6 + i;
                    } else {
                      pageNum = page - 3 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={cn(
                          "px-3 py-1 text-sm rounded-md min-w-[36px]",
                          page === pageNum
                            ? "bg-brand-purple text-white"
                            : "text-neutral-600 hover:bg-neutral-100"
                        )}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm border border-neutral-200 rounded-md hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function HistoricalAnalytics() {
  const [activeTab, setActiveTab] = useState("data-explorer");

  return (
    <div className="space-y-4">
      <TabNav activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "data-explorer" && <DataExplorer />}
      {activeTab === "hall-of-fame" && <Leaderboards />}
      {activeTab === "handshakes" && <HallOfFame />}
    </div>
  );
}
