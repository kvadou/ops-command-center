import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import DateRangePicker from "./DateRangePicker";
import { DateTime } from "luxon";

const CATEGORY_CONFIG = {
  error: { label: "Error Make-Good", color: "text-accent-pink", bg: "bg-accent-pink/5", border: "border-accent-pink/20", icon: "🔧" },
  trial: { label: "Trial Credit", color: "text-accent-cyan", bg: "bg-accent-cyan/5", border: "border-accent-cyan/20", icon: "🎯" },
  bundle: { label: "Bundle", color: "text-primary-500", bg: "bg-primary-50", border: "border-primary-200", icon: "📦" },
  goodwill: { label: "Goodwill", color: "text-accent-green", bg: "bg-accent-green/5", border: "border-accent-green/20", icon: "🤝" },
  uncategorized: { label: "Uncategorized", color: "text-accent-orange", bg: "bg-accent-orange/5", border: "border-accent-orange/20", icon: "❓" }
};

export default function CreditAdjustmentsSummary() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    startDate: DateTime.now().minus({ days: 30 }).toISODate(),
    endDate: DateTime.now().toISODate()
  });

  useEffect(() => {
    const fetchSummary = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (dateRange.startDate) params.append("start_date", dateRange.startDate);
        if (dateRange.endDate) params.append("end_date", dateRange.endDate);
        const res = await fetch(`/api/balance-adjustments/summary?${params}`, {
          credentials: 'include'
        });
        if (res.ok) {
          setSummary(await res.json());
        }
      } catch (err) {
        console.error("Failed to fetch credit summary:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, [dateRange.startDate, dateRange.endDate]);

  if (loading) {
    return (
      <div className="bg-white border border-neutral-200 rounded-xl shadow-sm p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-neutral-200 rounded w-48" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 bg-neutral-100 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const uncatCount = summary.summary.uncategorized?.count || 0;

  return (
    <div className="bg-white border border-neutral-200 rounded-xl shadow-sm">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 sm:px-6 py-3 border-b border-neutral-100 gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-neutral-900">
            Credit & Balance Adjustments
          </h3>
          {uncatCount > 0 && (
            <Link
              to="/analytics/credit-adjustments?category=uncategorized"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-accent-orange/10 text-accent-orange hover:bg-accent-orange/20 transition-colors"
            >
              {uncatCount} to tag
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3">
          <DateRangePicker
            value={dateRange}
            onChange={(start, end) => setDateRange({ startDate: start, endDate: end })}
          />
          <Link
            to="/analytics/credit-adjustments"
            className="text-sm font-medium text-primary-500 hover:text-primary-700 transition-colors whitespace-nowrap"
          >
            View All →
          </Link>
        </div>
      </div>
      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
            const data = summary.summary[key] || { count: 0, total: 0 };
            return (
              <Link
                key={key}
                to={`/analytics/credit-adjustments?category=${key}`}
                className={`${config.bg} ${config.border} border rounded-xl p-4 hover:shadow-md transition-all duration-200`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{config.icon}</span>
                  <span className={`text-xs font-semibold ${config.color} uppercase tracking-wider`}>
                    {config.label}
                  </span>
                </div>
                <p className={`text-xl font-bold ${config.color} tabular-nums`}>
                  ${data.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-neutral-500 mt-1">
                  {data.count} adjustment{data.count !== 1 ? "s" : ""}
                </p>
              </Link>
            );
          })}
        </div>
        <div className="mt-4 pt-4 border-t border-neutral-100 flex items-center justify-between">
          <span className="text-sm text-neutral-500">Total credits given</span>
          <span className="text-lg font-bold text-neutral-900 tabular-nums">
            ${summary.grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </div>
  );
}
