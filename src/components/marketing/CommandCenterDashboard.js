// src/components/marketing/CommandCenterDashboard.js
import React, { useState, useEffect, useCallback } from 'react';
import { formatCurrency } from '../../utils/formatters';
import {
  BellIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  LightBulbIcon,
  ClockIcon,
  SparklesIcon,
  XMarkIcon,
  InformationCircleIcon,
  UserGroupIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';


const formatNumber = (value) => {
  if (value == null || isNaN(value)) return '0';
  return Number(value).toLocaleString('en-US');
};

// Mini sparkline component
const Sparkline = ({ data, color = '#6366f1' }) => {
  if (!data || data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const width = 80;
  const height = 24;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="inline-block ml-2">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        points={points}
      />
    </svg>
  );
};

// Drilldown Modal component
const DrilldownModal = ({ isOpen, onClose, title, icon: Icon, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-neutral-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative inline-block w-full max-w-2xl bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8">
          {/* Header */}
          <div className="bg-gradient-to-r from-brand-navy to-brand-purple px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {Icon && <Icon className="h-6 w-6 text-white" />}
                <h3 className="text-lg font-semibold text-white">{title}</h3>
              </div>
              <button
                onClick={onClose}
                className="text-white/80 hover:text-white transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
            {children}
          </div>

          {/* Footer */}
          <div className="bg-neutral-50 px-6 py-3 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Spend Drilldown Content
const SpendDrilldown = ({ kpis, periodDays }) => {
  const platforms = kpis?.platformBreakdown || [];
  const totalSpend = kpis?.totalSpend || 0;
  const days = periodDays || 7;

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <InformationCircleIcon className="h-5 w-5 text-blue-600" />
          <span className="text-sm font-medium text-blue-800">What this means</span>
        </div>
        <p className="text-sm text-blue-700">
          This is your total ad spend across all platforms for the past {days} {days === 1 ? 'day' : 'days'}.
          A healthy spend pattern should align with your lead generation goals and maintain consistent daily distribution.
        </p>
      </div>

      <div>
        <h4 className="font-semibold text-neutral-900 mb-3">Spend by Platform</h4>
        <div className="space-y-3">
          {platforms.length > 0 ? platforms.map((p, idx) => {
            const percentage = totalSpend > 0 ? ((p.spend || 0) / totalSpend * 100) : 0;
            return (
              <div key={idx} className="bg-neutral-50 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-neutral-900 capitalize">{p.platform || 'Unknown'}</span>
                  <span className="text-lg font-semibold text-neutral-900">{formatCurrency(p.spend)}</span>
                </div>
                <div className="w-full bg-neutral-200 rounded-full h-2">
                  <div
                    className="bg-brand-purple h-2 rounded-full transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-xs text-neutral-500">
                  <span>{percentage.toFixed(1)}% of total</span>
                  <span>{formatCurrency((p.spend || 0) / days, 2)}/day avg</span>
                </div>
              </div>
            );
          }) : (
            <p className="text-sm text-neutral-500">No platform breakdown available</p>
          )}
        </div>
      </div>

      <div>
        <h4 className="font-semibold text-neutral-900 mb-3">Period Comparison</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-neutral-50 rounded-lg p-3">
            <p className="text-xs text-neutral-500">Current Period</p>
            <p className="text-xl font-semibold text-neutral-900">{formatCurrency(totalSpend)}</p>
          </div>
          <div className="bg-neutral-50 rounded-lg p-3">
            <p className="text-xs text-neutral-500">Previous Period</p>
            <p className="text-xl font-semibold text-neutral-900">{formatCurrency(kpis?.lastPeriodSpend || 0)}</p>
            {kpis?.spendChange !== undefined && (
              <p className={`text-sm ${kpis.spendChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {kpis.spendChange >= 0 ? '+' : ''}{kpis.spendChange.toFixed(1)}%
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="border-t pt-4">
        <h4 className="font-semibold text-neutral-900 mb-2">Recommendations</h4>
        <ul className="text-sm text-neutral-600 space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-brand-purple">•</span>
            Monitor daily spend to ensure budget pacing is on track
          </li>
          <li className="flex items-start gap-2">
            <span className="text-brand-purple">•</span>
            Compare platform efficiency using CPL and ROAS metrics
          </li>
          <li className="flex items-start gap-2">
            <span className="text-brand-purple">•</span>
            Reallocate budget to higher-performing platforms when possible
          </li>
        </ul>
      </div>
    </div>
  );
};

// Leads Drilldown Content
const LeadsDrilldown = ({ kpis, leadsData, leadsLoading, onLoadLeads, periodDays }) => {
  const platforms = kpis?.platformBreakdown || [];
  const totalLeads = kpis?.totalLeads || 0;
  const [showLeadsList, setShowLeadsList] = useState(false);
  const [platformFilter, setPlatformFilter] = useState('all');

  const handleShowLeads = () => {
    setShowLeadsList(true);
    if (onLoadLeads) onLoadLeads(platformFilter === 'all' ? null : platformFilter);
  };

  const handlePlatformFilter = (platform) => {
    setPlatformFilter(platform);
    if (showLeadsList && onLoadLeads) {
      onLoadLeads(platform === 'all' ? null : platform);
    }
  };

  const leads = leadsData?.leads || [];

  return (
    <div className="space-y-6">
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <InformationCircleIcon className="h-5 w-5 text-green-600" />
          <span className="text-sm font-medium text-green-800">What this means</span>
        </div>
        <p className="text-sm text-green-700">
          Leads represent trial bookings and inquiries generated through your marketing efforts.
          Higher lead volume with lower cost per lead indicates efficient marketing spend.
        </p>
      </div>

      <div>
        <h4 className="font-semibold text-neutral-900 mb-3">Leads by Source</h4>
        <div className="space-y-3">
          {platforms.length > 0 ? platforms.map((p, idx) => {
            const leadCount = p.leads || 0;
            const percentage = totalLeads > 0 ? (leadCount / totalLeads * 100) : 0;
            return (
              <div key={idx} className="bg-neutral-50 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-neutral-900 capitalize">{p.platform || 'Unknown'}</span>
                  <span className="text-lg font-semibold text-neutral-900">{formatNumber(leadCount)}</span>
                </div>
                <div className="w-full bg-neutral-200 rounded-full h-2">
                  <div
                    className="bg-brand-green h-2 rounded-full transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-xs text-neutral-500">
                  <span>{percentage.toFixed(1)}% of total</span>
                  <span>CPL: {formatCurrency(p.cpl || 0)}</span>
                </div>
              </div>
            );
          }) : (
            <p className="text-sm text-neutral-500">No source breakdown available</p>
          )}
        </div>
      </div>

      <div>
        <h4 className="font-semibold text-neutral-900 mb-3">Lead Quality Indicators</h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-neutral-50 rounded-lg p-3 text-center">
            <p className="text-xs text-neutral-500">Total Leads</p>
            <p className="text-xl font-semibold text-neutral-900">{formatNumber(totalLeads)}</p>
          </div>
          <div className="bg-neutral-50 rounded-lg p-3 text-center">
            <p className="text-xs text-neutral-500">Avg Daily</p>
            <p className="text-xl font-semibold text-neutral-900">{formatNumber(Math.round(totalLeads / (periodDays || 7)))}</p>
          </div>
          <div className="bg-neutral-50 rounded-lg p-3 text-center">
            <p className="text-xs text-neutral-500">Conversion Rate</p>
            <p className="text-xl font-semibold text-neutral-900">{(kpis?.conversionRate || 0).toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {/* Individual Leads List */}
      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-neutral-900">Individual Leads</h4>
          {!showLeadsList && (
            <button
              onClick={handleShowLeads}
              className="text-sm text-brand-purple hover:text-brand-navy font-medium flex items-center gap-1"
            >
              View Lead Details
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        {showLeadsList && (
          <>
            {/* Platform filter */}
            <div className="flex gap-2 mb-3 flex-wrap">
              <button
                onClick={() => handlePlatformFilter('all')}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  platformFilter === 'all'
                    ? 'bg-brand-purple text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                All
              </button>
              {['google', 'meta', 'klaviyo', 'other'].map(p => (
                <button
                  key={p}
                  onClick={() => handlePlatformFilter(p)}
                  className={`px-3 py-1 text-xs rounded-full capitalize transition-colors ${
                    platformFilter === p
                      ? 'bg-brand-purple text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {leadsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-purple"></div>
              </div>
            ) : leads.length > 0 ? (
              <div className="max-h-64 overflow-y-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Name</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Source</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Date</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Status</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-neutral-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {leads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-neutral-50">
                        <td className="px-3 py-2">
                          <div className="font-medium text-neutral-900">{lead.name}</div>
                          <div className="text-xs text-neutral-500">{lead.email}</div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${
                            lead.platform === 'google' ? 'bg-blue-100 text-blue-800' :
                            lead.platform === 'meta' ? 'bg-indigo-100 text-indigo-800' :
                            lead.platform === 'klaviyo' ? 'bg-green-100 text-green-800' :
                            'bg-neutral-100 text-neutral-800'
                          }`}>
                            {lead.platform}
                          </span>
                          {lead.utmCampaign && (
                            <div className="text-xs text-neutral-400 mt-0.5 truncate max-w-[100px]" title={lead.utmCampaign}>
                              {lead.utmCampaign}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-neutral-600">
                          {new Date(lead.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            lead.paymentStatus === 'paid' ? 'bg-green-100 text-green-800' :
                            lead.status === 'registered' ? 'bg-blue-100 text-blue-800' :
                            'bg-neutral-100 text-neutral-800'
                          }`}>
                            {lead.paymentStatus === 'paid' ? 'Paid' : lead.status || 'Pending'}
                          </span>
                          {lead.isTrial && (
                            <span className="ml-1 text-xs text-amber-600">Trial</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {lead.tutorCruncherUrl ? (
                            <a
                              href={lead.tutorCruncherUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-purple hover:text-brand-navy text-xs font-medium inline-flex items-center gap-1"
                            >
                              View in TC
                              <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-neutral-400 text-xs">No TC link</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-neutral-500 py-4 text-center">No leads found for this period</p>
            )}

            {leads.length > 0 && (
              <p className="text-xs text-neutral-400 mt-2">
                Showing {leads.length} leads. Click "View in TC" to verify in TutorCruncher.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// CPL Drilldown Content
const CplDrilldown = ({ kpis }) => {
  const platforms = kpis?.platformBreakdown || [];

  return (
    <div className="space-y-6">
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <InformationCircleIcon className="h-5 w-5 text-orange-600" />
          <span className="text-sm font-medium text-orange-800">What this means</span>
        </div>
        <p className="text-sm text-orange-700">
          Cost Per Lead (CPL) shows how much you're spending to acquire each potential customer.
          Lower CPL indicates more efficient marketing spend. Target CPL varies by channel and customer lifetime value.
        </p>
      </div>

      <div>
        <h4 className="font-semibold text-neutral-900 mb-3">CPL by Platform</h4>
        <div className="space-y-3">
          {platforms.length > 0 ? platforms.filter(p => p.leads > 0).map((p, idx) => {
            const cpl = p.cpl || 0;
            const maxCpl = Math.max(...platforms.map(pl => pl.cpl || 0));
            const barWidth = maxCpl > 0 ? (cpl / maxCpl * 100) : 0;
            const isGood = cpl < (kpis?.avgCpl || 999);

            return (
              <div key={idx} className="bg-neutral-50 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-neutral-900 capitalize">{p.platform || 'Unknown'}</span>
                    {isGood ? (
                      <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">Below Avg</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">Above Avg</span>
                    )}
                  </div>
                  <span className="text-lg font-semibold text-neutral-900">{formatCurrency(cpl)}</span>
                </div>
                <div className="w-full bg-neutral-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${isGood ? 'bg-green-500' : 'bg-orange-500'}`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-xs text-neutral-500">
                  <span>{formatNumber(p.leads || 0)} leads</span>
                  <span>{formatCurrency(p.spend || 0)} spent</span>
                </div>
              </div>
            );
          }) : (
            <p className="text-sm text-neutral-500">No CPL data available</p>
          )}
        </div>
      </div>

      <div>
        <h4 className="font-semibold text-neutral-900 mb-3">CPL Benchmarks</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-neutral-50 rounded-lg p-3">
            <p className="text-xs text-neutral-500">Your Average CPL</p>
            <p className="text-xl font-semibold text-neutral-900">{formatCurrency(kpis?.avgCpl || 0)}</p>
          </div>
          <div className="bg-neutral-50 rounded-lg p-3">
            <p className="text-xs text-neutral-500">Industry Benchmark</p>
            <p className="text-xl font-semibold text-neutral-900">{formatCurrency(15)}-{formatCurrency(30)}</p>
            <p className="text-xs text-neutral-500">Education sector</p>
          </div>
        </div>
      </div>

      <div className="border-t pt-4">
        <h4 className="font-semibold text-neutral-900 mb-2">Optimization Tips</h4>
        <ul className="text-sm text-neutral-600 space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-brand-orange">•</span>
            Shift budget to lower-CPL platforms while maintaining lead quality
          </li>
          <li className="flex items-start gap-2">
            <span className="text-brand-orange">•</span>
            Test different ad creatives to improve conversion rates
          </li>
          <li className="flex items-start gap-2">
            <span className="text-brand-orange">•</span>
            Refine audience targeting to reach more qualified prospects
          </li>
        </ul>
      </div>
    </div>
  );
};

// ROAS Drilldown Content
const RoasDrilldown = ({ kpis }) => {
  const platforms = kpis?.platformBreakdown || [];

  return (
    <div className="space-y-6">
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <InformationCircleIcon className="h-5 w-5 text-purple-600" />
          <span className="text-sm font-medium text-purple-800">What this means</span>
        </div>
        <p className="text-sm text-purple-700">
          Return on Ad Spend (ROAS) measures revenue generated per dollar spent on advertising.
          A ROAS of 2.0x means you're earning $2 for every $1 spent. Higher is better, but consider customer lifetime value.
        </p>
      </div>

      <div>
        <h4 className="font-semibold text-neutral-900 mb-3">ROAS by Platform</h4>
        <div className="space-y-3">
          {platforms.length > 0 ? platforms.filter(p => p.spend > 0).map((p, idx) => {
            const roas = p.roas || 0;
            const isGood = roas >= 1.0;
            const maxRoas = Math.max(...platforms.map(pl => pl.roas || 0), 3);
            const barWidth = maxRoas > 0 ? Math.min((roas / maxRoas * 100), 100) : 0;

            return (
              <div key={idx} className="bg-neutral-50 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-neutral-900 capitalize">{p.platform || 'Unknown'}</span>
                    {isGood ? (
                      <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">Profitable</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">Below 1x</span>
                    )}
                  </div>
                  <span className="text-lg font-semibold text-neutral-900">{roas.toFixed(2)}x</span>
                </div>
                <div className="w-full bg-neutral-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${isGood ? 'bg-purple-500' : 'bg-red-500'}`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-xs text-neutral-500">
                  <span>{formatCurrency(p.revenue || 0)} revenue</span>
                  <span>{formatCurrency(p.spend || 0)} spent</span>
                </div>
              </div>
            );
          }) : (
            <p className="text-sm text-neutral-500">No ROAS data available</p>
          )}
        </div>
      </div>

      <div>
        <h4 className="font-semibold text-neutral-900 mb-3">ROAS Analysis</h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-neutral-50 rounded-lg p-3 text-center">
            <p className="text-xs text-neutral-500">Total Revenue</p>
            <p className="text-lg font-semibold text-neutral-900">{formatCurrency(kpis?.totalRevenue || 0)}</p>
          </div>
          <div className="bg-neutral-50 rounded-lg p-3 text-center">
            <p className="text-xs text-neutral-500">Total Spend</p>
            <p className="text-lg font-semibold text-neutral-900">{formatCurrency(kpis?.totalSpend || 0)}</p>
          </div>
          <div className="bg-neutral-50 rounded-lg p-3 text-center">
            <p className="text-xs text-neutral-500">Net Return</p>
            <p className={`text-lg font-semibold ${(kpis?.totalRevenue || 0) - (kpis?.totalSpend || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency((kpis?.totalRevenue || 0) - (kpis?.totalSpend || 0))}
            </p>
          </div>
        </div>
      </div>

      <div className="border-t pt-4">
        <h4 className="font-semibold text-neutral-900 mb-2">Understanding ROAS</h4>
        <ul className="text-sm text-neutral-600 space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-brand-purple">•</span>
            <strong>1.0x:</strong> Break-even on immediate revenue (may still be profitable with LTV)
          </li>
          <li className="flex items-start gap-2">
            <span className="text-brand-purple">•</span>
            <strong>2.0x+:</strong> Good immediate return on ad spend
          </li>
          <li className="flex items-start gap-2">
            <span className="text-brand-purple">•</span>
            <strong>Consider:</strong> Customer lifetime value makes lower ROAS acceptable for acquisition
          </li>
        </ul>
      </div>
    </div>
  );
};

// Recommendation Drilldown Content
const RecommendationDrilldown = ({ insight }) => {
  let projectedImpact = insight.projected_impact;
  if (typeof projectedImpact === 'string') {
    try {
      projectedImpact = JSON.parse(projectedImpact);
    } catch {
      projectedImpact = {};
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <LightBulbIcon className="h-5 w-5 text-yellow-600" />
          <span className="text-sm font-medium text-yellow-800">AI Recommendation</span>
        </div>
        <p className="text-sm text-yellow-700">{insight.recommendation}</p>
      </div>

      <div>
        <h4 className="font-semibold text-neutral-900 mb-3">Analysis Details</h4>
        <div className="bg-neutral-50 rounded-lg p-4 space-y-3">
          <div>
            <p className="text-xs text-neutral-500">Platform</p>
            <p className="font-medium text-neutral-900 capitalize">{insight.platform || 'Cross-Platform'}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Priority Level</p>
            <span className={`inline-block px-2 py-0.5 text-xs rounded ${
              insight.priority === 'critical' ? 'bg-red-100 text-red-700' :
              insight.priority === 'high' ? 'bg-orange-100 text-orange-700' :
              insight.priority === 'medium' ? 'bg-blue-100 text-blue-700' :
              'bg-neutral-100 text-neutral-700'
            }`}>
              {insight.priority?.toUpperCase() || 'MEDIUM'}
            </span>
          </div>
          {insight.insight_type && (
            <div>
              <p className="text-xs text-neutral-500">Insight Type</p>
              <p className="font-medium text-neutral-900 capitalize">{insight.insight_type.replace(/_/g, ' ')}</p>
            </div>
          )}
        </div>
      </div>

      {projectedImpact && Object.keys(projectedImpact).length > 0 && (
        <div>
          <h4 className="font-semibold text-neutral-900 mb-3">Projected Impact</h4>
          <div className="grid grid-cols-2 gap-3">
            {projectedImpact.metric && (
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-xs text-neutral-500">Expected Outcome</p>
                <p className="font-medium text-green-700">{projectedImpact.metric}</p>
              </div>
            )}
            {projectedImpact.confidence && (
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs text-neutral-500">Confidence Level</p>
                <p className="font-medium text-blue-700 capitalize">{projectedImpact.confidence}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div>
        <h4 className="font-semibold text-neutral-900 mb-3">Supporting Data</h4>
        <div className="bg-neutral-50 rounded-lg p-4">
          <p className="text-sm text-neutral-600">
            This recommendation is based on analysis of your recent campaign performance,
            industry benchmarks, and historical trends. The AI considers factors like:
          </p>
          <ul className="text-sm text-neutral-600 mt-2 space-y-1">
            <li>• Current CPL and ROAS metrics</li>
            <li>• Week-over-week performance changes</li>
            <li>• Platform-specific optimization opportunities</li>
            <li>• Seasonal trends and market conditions</li>
          </ul>
        </div>
      </div>

      <div className="border-t pt-4">
        <h4 className="font-semibold text-neutral-900 mb-2">Next Steps</h4>
        <ol className="text-sm text-neutral-600 space-y-2 list-decimal list-inside">
          <li>Review the recommendation and supporting data</li>
          <li>Add to draft queue for implementation</li>
          <li>Monitor results after implementation</li>
          <li>Provide feedback to improve future recommendations</li>
        </ol>
      </div>
    </div>
  );
};

// Alert card component
const AlertCard = ({ alert, onDismiss }) => {
  const typeConfig = {
    critical: { bg: 'bg-red-50', border: 'border-red-200', icon: ExclamationTriangleIcon, iconColor: 'text-red-600' },
    warning: { bg: 'bg-yellow-50', border: 'border-yellow-200', icon: ExclamationTriangleIcon, iconColor: 'text-yellow-600' },
    positive: { bg: 'bg-green-50', border: 'border-green-200', icon: CheckCircleIcon, iconColor: 'text-green-600' },
  };

  const config = typeConfig[alert.alert_type] || typeConfig.warning;
  const Icon = config.icon;

  return (
    <div className={`${config.bg} ${config.border} border rounded-lg p-3 mb-2`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 ${config.iconColor} flex-shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-900">{alert.title}</p>
          <p className="text-xs text-neutral-600 mt-0.5 line-clamp-2">{alert.message}</p>
          {alert.platform && (
            <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-neutral-100 rounded">
              {alert.platform}
            </span>
          )}
        </div>
        <button
          onClick={() => onDismiss(alert.id)}
          className="text-neutral-400 hover:text-neutral-600 text-xs"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};

// Recommendation card component (updated with onClick)
const RecommendationCard = ({ insight, onAddToQueue, onDismiss, onClick }) => {
  const priorityColors = {
    critical: 'border-l-red-500',
    high: 'border-l-orange-500',
    medium: 'border-l-blue-500',
    low: 'border-l-neutral-400',
  };

  let projectedImpact = insight.projected_impact;
  if (typeof projectedImpact === 'string') {
    try {
      projectedImpact = JSON.parse(projectedImpact);
    } catch {
      projectedImpact = null;
    }
  }

  return (
    <div
      className={`bg-white border border-l-4 ${priorityColors[insight.priority]} rounded-lg p-3 mb-2 shadow-sm cursor-pointer hover:shadow-md transition-shadow`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <LightBulbIcon className="h-4 w-4 text-yellow-500" />
            <span className="text-xs font-medium text-neutral-500 uppercase">{insight.platform}</span>
            <ArrowTopRightOnSquareIcon className="h-3 w-3 text-neutral-400" />
          </div>
          <p className="text-sm font-medium text-neutral-900 mt-1">{insight.title}</p>
          <p className="text-xs text-neutral-600 mt-1 line-clamp-2">{insight.recommendation}</p>
          {projectedImpact && (
            <p className="text-xs text-green-600 mt-1">
              Projected: {projectedImpact.metric || JSON.stringify(projectedImpact)}
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-2 mt-2" onClick={e => e.stopPropagation()}>
        <button
          onClick={() => onAddToQueue(insight.id)}
          className="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          Add to Queue
        </button>
        <button
          onClick={() => onDismiss(insight.id)}
          className="text-xs px-2 py-1 text-neutral-600 hover:text-neutral-900"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};

// Budget recommendation card
const BudgetRecommendationCard = ({ rec, onApprove, onReject }) => {
  const parseAllocation = (allocation) => {
    if (!allocation) return {};
    if (typeof allocation === 'object') return allocation;
    try {
      return JSON.parse(allocation);
    } catch {
      return {};
    }
  };
  const current = parseAllocation(rec.current_allocation);
  const recommended = parseAllocation(rec.recommended_allocation);

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-4 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <CurrencyDollarIcon className="h-5 w-5 text-indigo-600" />
        <span className="font-medium text-neutral-900">Budget Reallocation</span>
        <span className={`px-2 py-0.5 text-xs rounded ${rec.confidence_score >= 0.8 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
          {Math.round((rec.confidence_score || 0) * 100)}% confidence
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <p className="text-xs text-neutral-500 mb-1">Current</p>
          {Object.entries(current).map(([platform, amount]) => (
            <p key={platform} className="text-sm">
              {platform}: {formatCurrency(amount, 0)}/day
            </p>
          ))}
        </div>
        <div>
          <p className="text-xs text-neutral-500 mb-1">Recommended</p>
          {Object.entries(recommended).map(([platform, amount]) => {
            const currentAmt = parseFloat(current[platform]) || 0;
            const recAmt = parseFloat(amount) || 0;
            const change = recAmt - currentAmt;
            return (
              <p key={platform} className="text-sm flex items-center gap-1">
                {platform}: {formatCurrency(recAmt, 0)}/day
                {change !== 0 && (
                  <span className={change > 0 ? 'text-green-600' : 'text-red-600'}>
                    ({change > 0 ? '+' : ''}{formatCurrency(change, 0)})
                  </span>
                )}
              </p>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-neutral-600 mb-3">{rec.rationale}</p>

      <div className="flex gap-2">
        <button
          onClick={() => onApprove(rec.id)}
          className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
        >
          Approve
        </button>
        <button
          onClick={() => onReject(rec.id)}
          className="px-3 py-1.5 text-neutral-600 text-sm hover:text-neutral-900"
        >
          Reject
        </button>
      </div>
    </div>
  );
};

// KPI card component (updated with click handler)
const KpiCard = ({ title, value, change, trend, sparklineData, onClick }) => {
  const isPositive = change >= 0;
  const TrendIcon = trend === 'up' ? ArrowTrendingUpIcon : ArrowTrendingDownIcon;

  return (
    <div
      className="bg-white rounded-lg border p-4 cursor-pointer hover:shadow-md hover:border-brand-purple/30 transition-all"
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">{title}</p>
        <ArrowTopRightOnSquareIcon className="h-4 w-4 text-neutral-400" />
      </div>
      <div className="flex items-end gap-2 mt-1">
        <span className="text-2xl font-semibold text-neutral-900">{value}</span>
        {change !== undefined && (
          <span className={`flex items-center text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            <TrendIcon className="h-4 w-4" />
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
      {sparklineData && <Sparkline data={sparklineData} color={isPositive ? '#10b981' : '#ef4444'} />}
    </div>
  );
};

// Time period options
const PERIOD_OPTIONS = [
  { value: 'day', label: 'Today', shortLabel: '1d', spendLabel: 'Daily Spend', leadsLabel: 'Leads (1d)' },
  { value: 'week', label: 'Last 7 Days', shortLabel: '7d', spendLabel: 'Weekly Spend', leadsLabel: 'Leads (7d)' },
  { value: 'month', label: 'Last 30 Days', shortLabel: '30d', spendLabel: 'Monthly Spend', leadsLabel: 'Leads (30d)' },
];

// Main dashboard component
export default function CommandCenterDashboard() {
  const [alerts, setAlerts] = useState([]);
  const [alertCounts, setAlertCounts] = useState({ critical: 0, warning: 0, positive: 0, total: 0 });
  const [insights, setInsights] = useState([]);
  const [budgetRecs, setBudgetRecs] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [aiAnalysisRunning, setAiAnalysisRunning] = useState(false);

  // Time period state
  const [period, setPeriod] = useState('week');

  // Drilldown modal state
  const [drilldownModal, setDrilldownModal] = useState({ isOpen: false, type: null, data: null });

  // Leads data for drilldown
  const [leadsData, setLeadsData] = useState(null);
  const [leadsLoading, setLeadsLoading] = useState(false);

  const openDrilldown = (type, data = null) => {
    setDrilldownModal({ isOpen: true, type, data });
  };

  const closeDrilldown = () => {
    setDrilldownModal({ isOpen: false, type: null, data: null });
  };

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      // Fetch all data in parallel (with period parameter for insights)
      const [alertsRes, alertCountsRes, insightsRes, budgetRes, summaryRes] = await Promise.all([
        fetch('/api/marketing-command-center/alerts?limit=5'),
        fetch('/api/marketing-command-center/alerts/counts'),
        fetch('/api/marketing-command-center/ai-brain/insights'),
        fetch('/api/marketing-command-center/budget/recommendations'),
        fetch(`/api/marketing-command-center/insights-summary?period=${period}`),
      ]);

      if (alertsRes.ok) setAlerts(await alertsRes.json());
      if (alertCountsRes.ok) setAlertCounts(await alertCountsRes.json());
      if (insightsRes.ok) setInsights((await insightsRes.json()).slice(0, 5));
      if (budgetRes.ok) {
        const data = await budgetRes.json();
        setBudgetRecs(data.recommendations || []);
      }
      if (summaryRes.ok) setKpis(await summaryRes.json());
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [period]);

  // Fetch individual leads for drilldown
  const fetchLeadsData = useCallback(async (platformFilter = null) => {
    setLeadsLoading(true);
    try {
      const url = platformFilter
        ? `/api/marketing-command-center/leads?period=${period}&platform=${platformFilter}`
        : `/api/marketing-command-center/leads?period=${period}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setLeadsData(data);
      }
    } catch (err) {
      console.error('Error fetching leads:', err);
    } finally {
      setLeadsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Handle period change
  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    setLeadsData(null); // Clear leads data when period changes
  };

  const handleDismissAlert = async (alertId) => {
    try {
      const res = await fetch(`/api/marketing-command-center/alerts/${alertId}/dismiss`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to dismiss alert');
      setAlerts(alerts.filter(a => a.id !== alertId));
      fetchData();
    } catch (err) {
      console.error('Error dismissing alert:', err);
    }
  };

  const handleDismissInsight = async (insightId) => {
    try {
      const res = await fetch(`/api/marketing-command-center/ai-brain/insights/${insightId}/dismiss`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to dismiss insight');
      setInsights(insights.filter(i => i.id !== insightId));
    } catch (err) {
      console.error('Error dismissing insight:', err);
    }
  };

  const handleAddToQueue = async (insightId) => {
    try {
      const res = await fetch(`/api/marketing-command-center/ai-brain/insights/${insightId}/to-draft`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to add to queue');
      setInsights(insights.filter(i => i.id !== insightId));
    } catch (err) {
      console.error('Error adding insight to queue:', err);
    }
  };

  const handleApproveBudget = async (recId) => {
    try {
      const res = await fetch(`/api/marketing-command-center/budget/recommendations/${recId}/approve`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to approve budget');
      fetchData();
    } catch (err) {
      console.error('Error approving budget recommendation:', err);
    }
  };

  const handleRejectBudget = async (recId) => {
    try {
      const res = await fetch(`/api/marketing-command-center/budget/recommendations/${recId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Rejected from dashboard' }),
      });
      if (!res.ok) throw new Error('Failed to reject budget');
      fetchData();
    } catch (err) {
      console.error('Error rejecting budget recommendation:', err);
    }
  };

  const handleRunAiAnalysis = async () => {
    setAiAnalysisRunning(true);
    try {
      const res = await fetch('/api/marketing-command-center/ai-brain/analyze', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to run AI analysis');
      await fetchData();
    } catch (err) {
      console.error('Error running AI analysis:', err);
    } finally {
      setAiAnalysisRunning(false);
    }
  };

  // Render drilldown content based on type
  const renderDrilldownContent = () => {
    switch (drilldownModal.type) {
      case 'spend':
        return <SpendDrilldown kpis={kpis} periodDays={kpis?.periodDays || 7} />;
      case 'leads':
        return (
          <LeadsDrilldown
            kpis={kpis}
            leadsData={leadsData}
            leadsLoading={leadsLoading}
            onLoadLeads={fetchLeadsData}
            periodDays={kpis?.periodDays || 7}
          />
        );
      case 'cpl':
        return <CplDrilldown kpis={kpis} periodDays={kpis?.periodDays || 7} />;
      case 'roas':
        return <RoasDrilldown kpis={kpis} />;
      case 'recommendation':
        return <RecommendationDrilldown insight={drilldownModal.data} />;
      default:
        return null;
    }
  };

  // Get period label for titles
  const periodOption = PERIOD_OPTIONS.find(p => p.value === period) || PERIOD_OPTIONS[1];

  const getDrilldownTitle = () => {
    switch (drilldownModal.type) {
      case 'spend': return `${periodOption.label} Spend Analysis`;
      case 'leads': return 'Lead Generation Breakdown';
      case 'cpl': return 'Cost Per Lead Analysis';
      case 'roas': return 'Return on Ad Spend Analysis';
      case 'recommendation': return drilldownModal.data?.title || 'Recommendation Details';
      default: return 'Details';
    }
  };

  const getDrilldownIcon = () => {
    switch (drilldownModal.type) {
      case 'spend': return CurrencyDollarIcon;
      case 'leads': return UserGroupIcon;
      case 'cpl': return ChartBarIcon;
      case 'roas': return ArrowTrendingUpIcon;
      case 'recommendation': return LightBulbIcon;
      default: return InformationCircleIcon;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <ExclamationTriangleIcon className="h-12 w-12 text-red-500 mb-4" />
        <p className="text-neutral-900 font-medium">{error}</p>
        <button
          onClick={fetchData}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Drilldown Modal */}
      <DrilldownModal
        isOpen={drilldownModal.isOpen}
        onClose={closeDrilldown}
        title={getDrilldownTitle()}
        icon={getDrilldownIcon()}
      >
        {renderDrilldownContent()}
      </DrilldownModal>

      {/* Header with quick actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Command Center</h1>
          <p className="text-sm text-neutral-500">Real-time marketing intelligence</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period Toggle */}
          <div className="flex items-center bg-neutral-100 rounded-lg p-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handlePeriodChange(opt.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  period === opt.value
                    ? 'bg-white text-brand-purple shadow-sm'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {opt.shortLabel}
              </button>
            ))}
          </div>
          <button
            onClick={handleRunAiAnalysis}
            disabled={aiAnalysisRunning}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            <SparklesIcon className="h-5 w-5" />
            {aiAnalysisRunning ? 'Analyzing...' : 'Run AI Analysis'}
          </button>
        </div>
      </div>

      {/* Alert summary bar */}
      {alertCounts.total > 0 && (
        <div className="bg-white border rounded-lg p-4 flex items-center gap-6">
          <div className="flex items-center gap-2">
            <BellIcon className="h-5 w-5 text-neutral-400" />
            <span className="font-medium">Alerts</span>
          </div>
          {alertCounts.critical > 0 && (
            <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-sm">
              {alertCounts.critical} Critical
            </span>
          )}
          {alertCounts.warning > 0 && (
            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm">
              {alertCounts.warning} Warnings
            </span>
          )}
          {alertCounts.positive > 0 && (
            <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-sm">
              {alertCounts.positive} Positive
            </span>
          )}
        </div>
      )}

      {/* KPI cards */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            title={periodOption.spendLabel}
            value={formatCurrency(kpis.totalSpend || 0)}
            change={kpis.spendChange}
            trend={kpis.spendChange >= 0 ? 'up' : 'down'}
            onClick={() => openDrilldown('spend')}
          />
          <KpiCard
            title={periodOption.leadsLabel}
            value={formatNumber(kpis.totalLeads || 0)}
            change={kpis.leadsChange}
            trend={kpis.leadsChange >= 0 ? 'up' : 'down'}
            onClick={() => openDrilldown('leads')}
          />
          <KpiCard
            title="Avg CPL"
            value={formatCurrency(kpis.avgCpl || 0)}
            change={kpis.cplChange}
            trend={kpis.cplChange <= 0 ? 'up' : 'down'}
            onClick={() => openDrilldown('cpl')}
          />
          <KpiCard
            title="ROAS"
            value={`${(kpis.avgRoas || 0).toFixed(2)}x`}
            change={kpis.roasChange}
            trend={kpis.roasChange >= 0 ? 'up' : 'down'}
            onClick={() => openDrilldown('roas')}
          />
        </div>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alerts column */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border p-4">
            <h2 className="font-semibold text-neutral-900 mb-3 flex items-center gap-2">
              <BellIcon className="h-5 w-5 text-neutral-400" />
              Recent Alerts
            </h2>
            {alerts.length === 0 ? (
              <p className="text-sm text-neutral-500">No active alerts</p>
            ) : (
              alerts.map(alert => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onDismiss={handleDismissAlert}
                />
              ))
            )}
          </div>
        </div>

        {/* Recommendations column */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border p-4">
            <h2 className="font-semibold text-neutral-900 mb-3 flex items-center gap-2">
              <LightBulbIcon className="h-5 w-5 text-yellow-500" />
              Top Recommendations
            </h2>
            {insights.length === 0 ? (
              <p className="text-sm text-neutral-500">No recommendations available</p>
            ) : (
              insights.map(insight => (
                <RecommendationCard
                  key={insight.id}
                  insight={insight}
                  onAddToQueue={handleAddToQueue}
                  onDismiss={handleDismissInsight}
                  onClick={() => openDrilldown('recommendation', insight)}
                />
              ))
            )}
          </div>
        </div>

        {/* Budget optimization column */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border p-4">
            <h2 className="font-semibold text-neutral-900 mb-3 flex items-center gap-2">
              <ChartBarIcon className="h-5 w-5 text-indigo-500" />
              Budget Optimizer
            </h2>
            {budgetRecs.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-neutral-500 mb-2">No pending recommendations</p>
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/marketing-command-center/budget/analyze', { method: 'POST' });
                      if (!res.ok) throw new Error('Failed to generate recommendation');
                      fetchData();
                    } catch (err) {
                      console.error('Error generating budget recommendation:', err);
                    }
                  }}
                  className="text-sm text-indigo-600 hover:text-indigo-800"
                >
                  Generate New Recommendation
                </button>
              </div>
            ) : (
              budgetRecs.map(rec => (
                <BudgetRecommendationCard
                  key={rec.id}
                  rec={rec}
                  onApprove={handleApproveBudget}
                  onReject={handleRejectBudget}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Drafts needing attention */}
      <div className="bg-white rounded-lg border p-4">
        <h2 className="font-semibold text-neutral-900 mb-3 flex items-center gap-2">
          <ClockIcon className="h-5 w-5 text-orange-500" />
          Needs Attention
        </h2>
        <p className="text-sm text-neutral-500">
          Review pending drafts, underperforming campaigns, and approval queue items in the respective sections.
        </p>
      </div>
    </div>
  );
}
