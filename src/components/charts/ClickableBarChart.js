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
 * ClickableBarChart
 * Enhanced bar chart with clickable bars for drill-down functionality
 *
 * Props:
 * - data: Array<{ name: string, value: number, tutors?: Array<{id, name, hours}> }>
 * - xKey: string (default: "name")
 * - yKey: string (default: "value")
 * - height: number|string (default: 160)
 * - color: string (default: "#6D28D9")
 * - showGrid: boolean (default: true)
 * - yWidth: number (default: 30)
 * - formatters: { x?: (v)=>string, y?: (v)=>string }
 * - referenceLines: Array<{ y: number, color?: string }>
 * - className: string
 * - onBarClick: (data) => void - Called when a bar is clicked
 */
export default function ClickableBarChart({
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
  onBarClick,
}) {
  const xFormatter = formatters.x;
  const yFormatter = formatters.y;

  const handleBarClick = (data, index) => {
    if (onBarClick && data) {
      onBarClick(data, index);
    }
  };

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
            domain={[0, 'dataMax + 1']}
            allowDecimals={false}
            interval={0}
          />
          <Tooltip 
            formatter={(v) => (yFormatter ? yFormatter(v) : v)} 
            labelFormatter={(v) => (xFormatter ? xFormatter(v) : v)}
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-white p-3 border border-neutral-200 rounded-lg shadow-lg">
                    <p className="font-medium text-neutral-900">{label}</p>
                    <p className="text-sm text-neutral-600">
                      Tutors: {payload[0].value}
                    </p>
                    {data.tutors && data.tutors.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-neutral-500 mb-1">Click bar to view tutors</p>
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            }}
          />
          {referenceLines.map((r, i) => (
            <ReferenceLine key={i} y={r.y} stroke={r.color || "#9CA3AF"} strokeDasharray="3 3" />
          ))}
          <Bar 
            dataKey={yKey} 
            fill={color} 
            radius={[4, 4, 0, 0]}
            onClick={handleBarClick}
            style={{ cursor: 'pointer' }}
          />
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}
