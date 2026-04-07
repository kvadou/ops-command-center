import React from "react";
import {
  AreaChart as RAreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

// Custom tooltip component for enhanced popup overlay
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const yFormatter = (v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="bg-white border border-neutral-200 rounded-lg shadow-lg p-3 min-w-[200px]">
      <p className="font-semibold text-neutral-800 mb-2 border-b border-neutral-200 pb-1">{label}</p>
      <div className="space-y-1.5">
        {payload.map((entry, index) => {
          const isProjected = entry.name?.includes('Projected');
          const value = entry.value || 0;
          const formattedValue = yFormatter(value);
          
          return (
            <div key={index} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded"
                  style={{ 
                    backgroundColor: entry.color,
                    opacity: isProjected ? 0.6 : 1
                  }}
                />
                <span className="text-sm text-neutral-600">{entry.name}</span>
              </div>
              <span className={`text-sm font-semibold ${isProjected ? 'text-neutral-500' : 'text-neutral-800'}`}>
                {formattedValue}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Format date label based on view
// Use UTC methods to avoid timezone shifts that can cause month misalignment
// PostgreSQL's date_trunc returns dates at midnight UTC, so we must use UTC methods
function formatLabel(dateISO, view) {
  const d = new Date(dateISO);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  if (view === 'weekly') {
    // For weekly, use UTC to get the correct week
    const month = monthNames[d.getUTCMonth()];
    const day = d.getUTCDate();
    return `${month} ${day}`;
  }
  if (view === 'yearly') {
    return String(d.getUTCFullYear());
  }
  // For monthly, use UTC to ensure we display the correct month
  // date_trunc returns the first of the month at midnight UTC, so we must use UTC methods
  const month = monthNames[d.getUTCMonth()];
  const year = d.getUTCFullYear().toString().slice(-2);
  return `${month} ${year}`;
}

export default function TrendsChart({
  data,
  view = 'monthly',
  height = 260,
  className,
}) {
  // Always use monthly format for labels to show wave pattern even when yearly date range is selected
  const labelView = view === 'yearly' ? 'monthly' : view;
  const chartData = (data || []).map(p => ({
    name: formatLabel(p.periodStart, labelView),
    revenue: Number(p.revenue || 0),
    profit: Number(p.profit || 0),
    // Handle null, undefined, and numeric values for projected data
    // Recharts needs null (not undefined) to properly skip rendering for those points
    revenueProjected: p.revenueProjected === null ? null : (p.revenueProjected !== undefined ? Number(p.revenueProjected || 0) : undefined),
    profitProjected: p.profitProjected === null ? null : (p.profitProjected !== undefined ? Number(p.profitProjected || 0) : undefined),
  }));
  
  // Debug: log if we have projected data with actual values
  const hasProjectedData = chartData.some(d => 
    (d.revenueProjected !== undefined && d.revenueProjected !== null) || 
    (d.profitProjected !== undefined && d.profitProjected !== null)
  );
  
  // Always log the last few months to debug
  const lastThreeMonths = chartData.slice(-3).map(d => ({
    name: d.name,
    revenue: d.revenue,
    revenueProjected: d.revenueProjected,
    profit: d.profit,
    profitProjected: d.profitProjected,
  }));
  
  console.log('TrendsChart: Data check', {
    hasProjectedData,
    totalPoints: chartData.length,
    lastThreeMonths,
    willRenderLines: hasProjectedData,
  });

  const yFormatter = (v) => `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  return (
    <div className={classNames("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RAreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="left" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={yFormatter} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={yFormatter} />
          <Tooltip 
            content={<CustomTooltip />}
            cursor={{ strokeDasharray: '3 3', stroke: '#94a3b8', strokeWidth: 1 }}
          />
          <Legend />
          <Area yAxisId="left" type="monotone" dataKey="revenue" name="Revenue" stroke="#6D28D9" fill="#6D28D9" fillOpacity={0.15} />
          <Area yAxisId="left" type="monotone" dataKey="profit" name="Profit" stroke="#16A34A" fill="#16A34A" fillOpacity={0.15} />
          {/* Projected lines (dotted) - render if we have projected data */}
          {hasProjectedData && (
            <>
              <Line 
                yAxisId="left" 
                type="linear" 
                dataKey="revenueProjected" 
                name="Revenue (Projected)" 
                stroke="#6D28D9" 
                strokeWidth={3} 
                strokeDasharray="10 5" 
                strokeOpacity={1}
                dot={{ r: 4, fill: '#6D28D9' }}
                activeDot={{ r: 6, fill: '#6D28D9' }}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line 
                yAxisId="left" 
                type="linear" 
                dataKey="profitProjected" 
                name="Profit (Projected)" 
                stroke="#16A34A" 
                strokeWidth={3} 
                strokeDasharray="10 5" 
                strokeOpacity={1}
                dot={{ r: 4, fill: '#16A34A' }}
                activeDot={{ r: 6, fill: '#16A34A' }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </>
          )}
        </RAreaChart>
      </ResponsiveContainer>
    </div>
  );
}


