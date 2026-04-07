import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DateTime } from "luxon";
import { InboxIcon } from "@heroicons/react/24/outline";
import DateRangePicker from "./DateRangePicker";

const CATEGORIES = [
  { value: "all", label: "All Categories" },
  { value: "error", label: "Error Make-Good" },
  { value: "trial", label: "Trial Credit" },
  { value: "bundle", label: "Bundle" },
  { value: "goodwill", label: "Goodwill" },
  { value: "uncategorized", label: "Uncategorized" }
];

const CATEGORY_BADGES = {
  error: "bg-accent-pink/10 text-accent-pink",
  trial: "bg-accent-cyan/10 text-accent-cyan",
  bundle: "bg-primary-50 text-primary-500",
  goodwill: "bg-accent-green/10 text-accent-green",
  uncategorized: "bg-accent-orange/10 text-accent-orange"
};

export default function CreditAdjustmentsTable() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [adjustments, setAdjustments] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState(null);
  const [editCategory, setEditCategory] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const category = searchParams.get("category") || "all";
  const [startDate, setStartDate] = useState(
    searchParams.get("start_date") || DateTime.now().minus({ days: 90 }).toISODate()
  );
  const [endDate, setEndDate] = useState(
    searchParams.get("end_date") || DateTime.now().toISODate()
  );
  const limit = 50;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category !== "all") params.append("category", category);
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      params.append("page", page);
      params.append("limit", limit);

      const res = await fetch(`/api/balance-adjustments?${params}`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setAdjustments(data.adjustments);
        setTotal(data.total);
      }
    } catch (err) {
      console.error("Failed to fetch adjustments:", err);
    } finally {
      setLoading(false);
    }
  }, [category, startDate, endDate, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCategoryFilter = (val) => {
    const newParams = new URLSearchParams(searchParams);
    if (val === "all") {
      newParams.delete("category");
    } else {
      newParams.set("category", val);
    }
    setSearchParams(newParams);
    setPage(1);
  };

  const startEditing = (adj) => {
    setEditingId(adj.id);
    setEditCategory(adj.category);
    setEditNotes(adj.notes || "");
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditCategory("");
    setEditNotes("");
  };

  const saveCategorization = async (id) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/balance-adjustments/${id}/categorize`, {
        method: "PATCH",
        credentials: 'include',
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ category: editCategory, notes: editNotes })
      });
      if (res.ok) {
        const updated = await res.json();
        setAdjustments((prev) =>
          prev.map((a) => (a.id === id ? updated : a))
        );
        setEditingId(null);
      }
    } catch (err) {
      console.error("Failed to save categorization:", err);
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <select
          value={category}
          onChange={(e) => handleCategoryFilter(e.target.value)}
          className="px-3 py-2.5 border border-neutral-300 rounded-[10px] text-sm text-neutral-900 hover:border-neutral-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-colors"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <DateRangePicker
          value={{ startDate, endDate }}
          onChange={(start, end) => { setStartDate(start); setEndDate(end); setPage(1); }}
        />
        <span className="text-sm text-neutral-500 ml-auto tabular-nums">
          {total} adjustment{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Client</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-600 uppercase tracking-wider">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">TC Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Category</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Actor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Notes</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16">
                    <div className="flex items-center justify-center gap-3">
                      <svg className="animate-spin h-5 w-5 text-primary-500" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span className="text-sm text-neutral-500">Loading adjustments...</span>
                    </div>
                  </td>
                </tr>
              ) : adjustments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16">
                    <div className="flex flex-col items-center justify-center text-center">
                      <InboxIcon className="h-12 w-12 text-neutral-300 mb-4" />
                      <h3 className="text-lg font-semibold text-neutral-600 mb-2">No adjustments found</h3>
                      <p className="text-sm text-neutral-400 max-w-sm">
                        Balance adjustments from TutorCruncher will appear here as they are captured via webhooks.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                adjustments.map((adj) => (
                  <tr key={adj.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap">
                      {DateTime.fromISO(adj.created_at).toFormat("MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Link
                        to={`/clients/${adj.client_id}`}
                        className="text-primary-500 hover:text-primary-700 font-medium transition-colors"
                      >
                        {adj.client_first_name} {adj.client_last_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-neutral-900 whitespace-nowrap tabular-nums">
                      ${parseFloat(adj.amount || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">
                      {adj.tc_type === "bonus_credit" ? "Bonus Credit" : "Balance Correction"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {editingId === adj.id ? (
                        <select
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          className="px-2 py-1.5 border border-neutral-300 rounded-[10px] text-sm hover:border-neutral-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-colors"
                        >
                          {CATEGORIES.filter((c) => c.value !== "all").map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_BADGES[adj.category] || CATEGORY_BADGES.uncategorized}`}>
                          {CATEGORIES.find((c) => c.value === adj.category)?.label || adj.category}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">
                      {adj.actor_name || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600 max-w-[200px] truncate">
                      {editingId === adj.id ? (
                        <input
                          type="text"
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Add notes..."
                          className="w-full px-2 py-1.5 border border-neutral-300 rounded-[10px] text-sm hover:border-neutral-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 placeholder:text-neutral-400 transition-colors"
                        />
                      ) : (
                        adj.notes || adj.description || "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      {editingId === adj.id ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveCategorization(adj.id)}
                            disabled={saving}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-primary-500 rounded-[10px] hover:bg-primary-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {saving ? "..." : "Save"}
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 rounded-[10px] transition-all duration-200"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditing(adj)}
                          className="px-3 py-1.5 text-xs font-medium text-primary-500 hover:text-primary-700 hover:bg-primary-50 rounded-[10px] transition-all duration-200"
                        >
                          {adj.category === "uncategorized" ? "Tag" : "Edit"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 bg-neutral-50">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-[10px] hover:bg-neutral-50 hover:border-neutral-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              Previous
            </button>
            <span className="text-sm text-neutral-600 tabular-nums">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-[10px] hover:bg-neutral-50 hover:border-neutral-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
