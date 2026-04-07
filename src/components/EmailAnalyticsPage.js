import React, { useState, useEffect } from 'react';
import { ChartBarIcon, EnvelopeIcon, EyeIcon, CursorArrowRaysIcon, XCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
export default function EmailAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchMetrics();
  }, [dateRange]);

  const fetchMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        start_date: dateRange.start,
        end_date: dateRange.end
      });
      const response = await fetch(`/api/email-analytics/metrics?${params}`);
      if (!response.ok) throw new Error('Failed to fetch email analytics');
      const data = await response.json();
      setMetrics(data);
    } catch (err) {
      console.error('Error fetching email analytics:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatPercentage = (value, total) => {
    if (!total || total === 0) return '0%';
    return `${((value / total) * 100).toFixed(1)}%`;
  };

  const formatNumber = (num) => {
    if (num === null || num === undefined) return '0';
    return num.toLocaleString();
  };

  const statCards = metrics ? [
    {
      name: 'Total Sent',
      value: formatNumber(metrics.total_sent),
      icon: EnvelopeIcon,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    {
      name: 'Delivered',
      value: formatNumber(metrics.delivered),
      subtitle: formatPercentage(metrics.delivered, metrics.total_sent),
      icon: EnvelopeIcon,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    },
    {
      name: 'Opened',
      value: formatNumber(metrics.opened),
      subtitle: formatPercentage(metrics.opened, metrics.delivered),
      icon: EyeIcon,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50'
    },
    {
      name: 'Clicked',
      value: formatNumber(metrics.clicked),
      subtitle: formatPercentage(metrics.clicked, metrics.delivered),
      icon: CursorArrowRaysIcon,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50'
    },
    {
      name: 'Bounced',
      value: formatNumber(metrics.bounced),
      subtitle: formatPercentage(metrics.bounced, metrics.total_sent),
      icon: XCircleIcon,
      color: 'text-red-600',
      bgColor: 'bg-red-50'
    },
    {
      name: 'Spam Complaints',
      value: formatNumber(metrics.complained),
      subtitle: formatPercentage(metrics.complained, metrics.delivered),
      icon: ExclamationTriangleIcon,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50'
    },
    {
      name: 'Open Rate',
      value: formatPercentage(metrics.opened, metrics.delivered),
      icon: ChartBarIcon,
      color: 'text-brand-purple',
      bgColor: 'bg-brand-light'
    },
    {
      name: 'Click Rate',
      value: formatPercentage(metrics.clicked, metrics.delivered),
      icon: ChartBarIcon,
      color: 'text-brand-navy',
      bgColor: 'bg-blue-50'
    },
    {
      name: 'Avg Engagement Score',
      value: metrics.avg_engagement_score ? parseFloat(metrics.avg_engagement_score).toFixed(2) : '0.00',
      icon: ChartBarIcon,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    }
  ] : [];

  return (
      <div className="max-w-7xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-neutral-900">Email Analytics</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Track email performance, engagement rates, and delivery metrics
          </p>
        </div>

        {/* Date Range Filter */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 mb-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-neutral-700">Date Range:</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
            />
            <span className="text-neutral-500">to</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
            />
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
            <p className="mt-4 text-sm text-neutral-600">Loading email analytics...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
            <p className="text-sm text-red-600">Error: {error}</p>
          </div>
        ) : (
          <>
            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {statCards.map((stat, index) => {
                const Icon = stat.icon;
                return (
                  <div
                    key={index}
                    className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-neutral-500">{stat.name}</p>
                        <p className="mt-2 text-3xl font-semibold text-neutral-900">{stat.value}</p>
                        {stat.subtitle && (
                          <p className="mt-1 text-sm text-neutral-600">{stat.subtitle}</p>
                        )}
                      </div>
                      <div className={`${stat.bgColor} rounded-lg p-3`}>
                        <Icon className={`h-6 w-6 ${stat.color}`} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Additional Analytics */}
            {metrics && (
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
                <h2 className="text-lg font-semibold text-neutral-900 mb-4">Performance Summary</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-medium text-neutral-700 mb-2">Delivery Metrics</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Delivery Rate:</span>
                        <span className="font-medium text-neutral-900">
                          {formatPercentage(metrics.delivered, metrics.total_sent)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Bounce Rate:</span>
                        <span className="font-medium text-red-600">
                          {formatPercentage(metrics.bounced, metrics.total_sent)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-neutral-700 mb-2">Engagement Metrics</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Open Rate:</span>
                        <span className="font-medium text-neutral-900">
                          {formatPercentage(metrics.opened, metrics.delivered)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Click Rate:</span>
                        <span className="font-medium text-neutral-900">
                          {formatPercentage(metrics.clicked, metrics.delivered)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-600">Click-to-Open Rate:</span>
                        <span className="font-medium text-neutral-900">
                          {formatPercentage(metrics.clicked, metrics.opened)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
  );
}

