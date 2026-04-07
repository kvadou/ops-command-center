import React from "react";
import {
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

/**
 * InlineBarChart
 * Lightweight, reusable bar chart for compact KPI/section visuals.
 *
 * Props:
 * - data: Array<{ [xKey]: string|number, [yKey]: number }>
 * - xKey: string (default: "name")
 * - yKey: string (default: "value")
 * - height: number|string (default: 160)
 * - color: string (default: "#6D28D9")
 * - showGrid: boolean (default: true)
 * - yWidth: number (default: 30)
 * - formatters: { x?: (v)=>string, y?: (v)=>string }
 * - referenceLines: Array<{ y: number, color?: string }>
 * - className: string
 */
export default function InlineBarChart({
  data,
  xKey = "name",
  yKey = "value",
  height = 160,
  color = "#6D28D9",
  showGrid = true,
  yWidth = 30,
  formatters = {},
  referenceLines = [],
  className,
}) {
  const xFormatter = formatters.x;
  const yFormatter = formatters.y;

  return (
    <div className={classNames("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RBarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          {showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} />}
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={xFormatter}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            width={yWidth}
            tickLine={false}
            axisLine={false}
            tickFormatter={yFormatter}
          />
          <Tooltip formatter={(v) => (yFormatter ? yFormatter(v) : v)} labelFormatter={(v) => (xFormatter ? xFormatter(v) : v)} />
          {referenceLines.map((r, i) => (
            <ReferenceLine key={i} y={r.y} stroke={r.color || "#9CA3AF"} strokeDasharray="3 3" />
          ))}
          <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} />
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}


