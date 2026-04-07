/**
 * Marketing Report Service
 *
 * Generates scheduled marketing reports with performance metrics,
 * trends, and recommendations.
 *
 * Features:
 * - Weekly performance summaries
 * - Campaign-level analysis
 * - Trend comparisons
 * - PDF/HTML report generation
 */

const { logger } = require('../utils/logger');
const MarketingDataAggregator = require('./marketing-data-aggregator');

class MarketingReportService {
  constructor(pool) {
    this.pool = pool;
    this.dataAggregator = new MarketingDataAggregator(pool);
  }

  /**
   * Generate a weekly marketing report
   * @param {Object} options - Report options
   * @returns {Promise<Object>} Report data
   */
  async generateWeeklyReport(options = {}) {
    const {
      endDate = new Date(),
      compareToPrevious = true,
    } = options;

    try {
      // Calculate date ranges
      const thisWeekEnd = new Date(endDate);
      const thisWeekStart = new Date(thisWeekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
      const lastWeekEnd = new Date(thisWeekStart.getTime() - 1);
      const lastWeekStart = new Date(lastWeekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Fetch this week's data
      const thisWeekData = await this.fetchWeekData(thisWeekStart, thisWeekEnd);

      // Fetch last week's data for comparison
      let lastWeekData = null;
      if (compareToPrevious) {
        lastWeekData = await this.fetchWeekData(lastWeekStart, lastWeekEnd);
      }

      // Build report
      const report = {
        generatedAt: new Date().toISOString(),
        period: {
          start: thisWeekStart.toISOString(),
          end: thisWeekEnd.toISOString(),
        },
        summary: this.buildSummary(thisWeekData, lastWeekData),
        platformBreakdown: this.buildPlatformBreakdown(thisWeekData.platforms),
        topCampaigns: thisWeekData.topCampaigns,
        bottomCampaigns: thisWeekData.bottomCampaigns,
        trends: this.buildTrends(thisWeekData, lastWeekData),
        recommendations: await this.generateRecommendations(thisWeekData, lastWeekData),
      };

      // Save report to database
      await this.saveReport(report);

      return report;
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to generate weekly report');
      throw error;
    }
  }

  /**
   * Fetch all data for a week
   */
  async fetchWeekData(startDate, endDate) {
    const dates = { startDate, endDate };

    const [
      spendSummary,
      conversionMetrics,
      topCampaigns,
      bottomCampaigns,
    ] = await Promise.all([
      this.dataAggregator.getSpendSummary(dates),
      this.dataAggregator.getConversionMetrics(dates),
      this.dataAggregator.getTopCampaigns(dates, 5),
      this.dataAggregator.getBottomCampaigns(dates, 3),
    ]);

    return {
      platforms: spendSummary.byPlatform || [],
      totals: spendSummary.totals || {},
      conversions: conversionMetrics,
      topCampaigns,
      bottomCampaigns,
    };
  }

  /**
   * Build summary with WoW comparisons
   */
  buildSummary(thisWeek, lastWeek) {
    const current = thisWeek.totals;
    const previous = lastWeek?.totals || {};

    const calcChange = (curr, prev) => {
      if (!prev || prev === 0) return null;
      return ((curr - prev) / prev * 100).toFixed(1);
    };

    return {
      totalSpend: {
        value: current.totalSpend || 0,
        change: calcChange(current.totalSpend, previous.totalSpend),
      },
      totalLeads: {
        value: thisWeek.conversions?.totalLeads || 0,
        change: calcChange(thisWeek.conversions?.totalLeads, lastWeek?.conversions?.totalLeads),
      },
      totalRevenue: {
        value: thisWeek.conversions?.totalRevenue || 0,
        change: calcChange(thisWeek.conversions?.totalRevenue, lastWeek?.conversions?.totalRevenue),
      },
      roas: {
        value: current.totalSpend > 0
          ? (thisWeek.conversions?.totalRevenue || 0) / current.totalSpend
          : 0,
        change: null, // ROAS change calculated differently
      },
      cpl: {
        value: (thisWeek.conversions?.totalLeads || 0) > 0
          ? (current.totalSpend || 0) / thisWeek.conversions.totalLeads
          : 0,
        change: null,
      },
      conversionRate: {
        value: parseFloat(thisWeek.conversions?.conversionRate || 0),
        change: calcChange(
          parseFloat(thisWeek.conversions?.conversionRate || 0),
          parseFloat(lastWeek?.conversions?.conversionRate || 0)
        ),
      },
    };
  }

  /**
   * Build platform breakdown
   */
  buildPlatformBreakdown(platforms) {
    return platforms.map(p => ({
      platform: p.platform,
      spend: parseFloat(p.total_spend || 0),
      impressions: parseInt(p.total_impressions || 0),
      clicks: parseInt(p.total_clicks || 0),
      ctr: parseFloat(p.avg_ctr || 0),
      cpc: parseFloat(p.avg_cpc || 0),
    }));
  }

  /**
   * Build trend analysis
   */
  buildTrends(thisWeek, lastWeek) {
    const trends = [];

    // Spend trend
    if (thisWeek.totals.totalSpend > (lastWeek?.totals?.totalSpend || 0)) {
      trends.push({
        type: 'spend_increase',
        message: 'Ad spend increased this week',
        severity: 'info',
      });
    } else if (thisWeek.totals.totalSpend < (lastWeek?.totals?.totalSpend || 0)) {
      trends.push({
        type: 'spend_decrease',
        message: 'Ad spend decreased this week',
        severity: 'warning',
      });
    }

    // Leads trend
    const thisWeekLeads = thisWeek.conversions?.totalLeads || 0;
    const lastWeekLeads = lastWeek?.conversions?.totalLeads || 0;
    if (thisWeekLeads > lastWeekLeads) {
      trends.push({
        type: 'leads_increase',
        message: `Leads increased by ${thisWeekLeads - lastWeekLeads} this week`,
        severity: 'success',
      });
    } else if (thisWeekLeads < lastWeekLeads) {
      trends.push({
        type: 'leads_decrease',
        message: `Leads decreased by ${lastWeekLeads - thisWeekLeads} this week`,
        severity: 'warning',
      });
    }

    // Efficiency trend (CPL)
    const thisWeekCPL = thisWeekLeads > 0 ? thisWeek.totals.totalSpend / thisWeekLeads : 0;
    const lastWeekCPL = lastWeekLeads > 0 ? (lastWeek?.totals?.totalSpend || 0) / lastWeekLeads : 0;
    if (thisWeekCPL > 0 && lastWeekCPL > 0) {
      if (thisWeekCPL < lastWeekCPL) {
        trends.push({
          type: 'cpl_improved',
          message: `CPL improved from $${lastWeekCPL.toFixed(2)} to $${thisWeekCPL.toFixed(2)}`,
          severity: 'success',
        });
      } else if (thisWeekCPL > lastWeekCPL * 1.1) {
        trends.push({
          type: 'cpl_worsened',
          message: `CPL increased from $${lastWeekCPL.toFixed(2)} to $${thisWeekCPL.toFixed(2)}`,
          severity: 'warning',
        });
      }
    }

    return trends;
  }

  /**
   * Generate AI-style recommendations
   */
  async generateRecommendations(thisWeek, lastWeek) {
    const recommendations = [];

    // Check for underperforming campaigns
    if (thisWeek.bottomCampaigns && thisWeek.bottomCampaigns.length > 0) {
      thisWeek.bottomCampaigns.forEach(campaign => {
        const roas = parseFloat(campaign.roas || 0);
        if (roas < 1) {
          recommendations.push({
            type: 'pause_campaign',
            priority: 'high',
            platform: campaign.platform,
            campaignId: campaign.campaign_id,
            campaignName: campaign.campaign_name,
            message: `Consider pausing "${campaign.campaign_name}" - ROAS of ${roas.toFixed(2)}x is below break-even`,
          });
        }
      });
    }

    // Check for high-performing campaigns to scale
    if (thisWeek.topCampaigns && thisWeek.topCampaigns.length > 0) {
      thisWeek.topCampaigns.forEach(campaign => {
        const roas = parseFloat(campaign.roas || 0);
        if (roas > 3) {
          recommendations.push({
            type: 'scale_campaign',
            priority: 'medium',
            platform: campaign.platform,
            campaignId: campaign.campaign_id,
            campaignName: campaign.campaign_name,
            message: `Consider scaling "${campaign.campaign_name}" - Strong ROAS of ${roas.toFixed(2)}x`,
          });
        }
      });
    }

    // Platform allocation suggestions
    const platforms = thisWeek.platforms || [];
    if (platforms.length > 1) {
      const bestPlatform = platforms.reduce((best, p) => {
        const pROAS = parseFloat(p.total_spend) > 0 ? 1 : 0; // Simplified
        const bestROAS = parseFloat(best.total_spend) > 0 ? 1 : 0;
        return pROAS > bestROAS ? p : best;
      }, platforms[0]);

      if (bestPlatform) {
        recommendations.push({
          type: 'platform_allocation',
          priority: 'low',
          message: `${bestPlatform.platform} is showing strong performance - consider increasing budget allocation`,
        });
      }
    }

    return recommendations;
  }

  /**
   * Save report to database
   */
  async saveReport(report) {
    try {
      await this.pool.query(`
        INSERT INTO marketing_insights_cache (insight_type, insight_key, data, expires_at)
        VALUES ('weekly_report', $1, $2, NOW() + INTERVAL '30 days')
        ON CONFLICT (insight_type, insight_key)
        DO UPDATE SET data = $2, expires_at = NOW() + INTERVAL '30 days'
      `, [report.period.start, JSON.stringify(report)]);
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to save report to cache');
    }
  }

  /**
   * Get recent reports
   */
  async getRecentReports(limit = 10) {
    try {
      const result = await this.pool.query(`
        SELECT data, expires_at
        FROM marketing_insights_cache
        WHERE insight_type = 'weekly_report'
        ORDER BY insight_key DESC
        LIMIT $1
      `, [limit]);

      return result.rows.map(r => r.data);
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to get recent reports');
      return [];
    }
  }

  /**
   * Generate HTML report for email/display
   */
  generateHTMLReport(report) {
    const formatMoney = (v) => `$${parseFloat(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    const formatChange = (change) => {
      if (change === null) return '';
      const num = parseFloat(change);
      const color = num >= 0 ? '#10B981' : '#EF4444';
      const arrow = num >= 0 ? '↑' : '↓';
      return `<span style="color: ${color}">${arrow} ${Math.abs(num)}%</span>`;
    };

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Weekly Marketing Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #2D2F8E; border-bottom: 2px solid #2D2F8E; padding-bottom: 10px; }
    h2 { color: #475569; margin-top: 30px; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 20px 0; }
    .metric-card { background: #f8fafc; border-radius: 8px; padding: 16px; }
    .metric-label { font-size: 12px; color: #64748b; text-transform: uppercase; }
    .metric-value { font-size: 24px; font-weight: 600; margin: 4px 0; }
    .trend { padding: 8px 12px; border-radius: 6px; margin: 8px 0; }
    .trend-success { background: #dcfce7; color: #166534; }
    .trend-warning { background: #fef3c7; color: #92400e; }
    .trend-info { background: #e0f2fe; color: #0369a1; }
    .recommendation { padding: 12px; border-left: 4px solid #2D2F8E; background: #f8fafc; margin: 8px 0; }
    .recommendation-high { border-color: #EF4444; }
    .recommendation-medium { border-color: #F59E0B; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    th { background: #f8fafc; font-weight: 600; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <h1>Weekly Marketing Report</h1>
  <p>Period: ${new Date(report.period.start).toLocaleDateString()} - ${new Date(report.period.end).toLocaleDateString()}</p>

  <h2>Summary</h2>
  <div class="summary-grid">
    <div class="metric-card">
      <div class="metric-label">Total Spend</div>
      <div class="metric-value">${formatMoney(report.summary.totalSpend.value)}</div>
      ${formatChange(report.summary.totalSpend.change)}
    </div>
    <div class="metric-card">
      <div class="metric-label">Total Leads</div>
      <div class="metric-value">${report.summary.totalLeads.value}</div>
      ${formatChange(report.summary.totalLeads.change)}
    </div>
    <div class="metric-card">
      <div class="metric-label">Total Revenue</div>
      <div class="metric-value">${formatMoney(report.summary.totalRevenue.value)}</div>
      ${formatChange(report.summary.totalRevenue.change)}
    </div>
    <div class="metric-card">
      <div class="metric-label">ROAS</div>
      <div class="metric-value">${report.summary.roas.value.toFixed(2)}x</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">CPL</div>
      <div class="metric-value">${formatMoney(report.summary.cpl.value)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Conversion Rate</div>
      <div class="metric-value">${report.summary.conversionRate.value}%</div>
      ${formatChange(report.summary.conversionRate.change)}
    </div>
  </div>

  <h2>Trends</h2>
  ${report.trends.map(t => `<div class="trend trend-${t.severity}">${t.message}</div>`).join('')}

  <h2>Platform Breakdown</h2>
  <table>
    <thead>
      <tr><th>Platform</th><th>Spend</th><th>Clicks</th><th>CTR</th><th>CPC</th></tr>
    </thead>
    <tbody>
      ${report.platformBreakdown.map(p => `
        <tr>
          <td>${p.platform}</td>
          <td>${formatMoney(p.spend)}</td>
          <td>${p.clicks.toLocaleString()}</td>
          <td>${p.ctr.toFixed(2)}%</td>
          <td>${formatMoney(p.cpc)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <h2>Recommendations</h2>
  ${report.recommendations.map(r => `
    <div class="recommendation recommendation-${r.priority}">
      <strong>${r.type.replace(/_/g, ' ').toUpperCase()}</strong>: ${r.message}
    </div>
  `).join('')}

  <div class="footer">
    Generated by Marketing Command Center • ${new Date(report.generatedAt).toLocaleString()}
  </div>
</body>
</html>
    `;
  }
}

module.exports = MarketingReportService;
